/**
 * Gemini Provider
 * Implementation of LLMProvider using Google's Generative AI SDK
 */

import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  GenerativeModel,
} from "@google/generative-ai";
import type {
  LLMProvider,
  GeneratedQuery,
  ContentToAnalyze,
  RelevancyResult,
  ResultForReport,
  CompiledReport,
} from "../../interfaces/llm-provider";
import {
  QUERY_GENERATION_PROMPTS,
  RELEVANCY_ANALYSIS_PROMPTS,
  SEARCH_RESULT_FILTERING_PROMPTS,
  REPORT_COMPILATION_PROMPTS,
  renderPrompt,
} from "./prompts";

export class GeminiProvider implements LLMProvider {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private modelName: string;

  constructor(apiKey: string, modelName: string = "gemini-1.5-flash-8b") {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
    this.model = this.genAI.getGenerativeModel({
      model: modelName,
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
      ],
    });
  }

  /**
   * Generate search queries
   */
  async generateSearchQueries(
    description: string,
    additionalContext?: string,
    options?: { count?: number; focusRecent?: boolean }
  ): Promise<GeneratedQuery[]> {
    const promptConfig = QUERY_GENERATION_PROMPTS;
    
    // Render user prompt
    const userPrompt = renderPrompt(promptConfig.user, {
      description,
      additionalContext: additionalContext || "",
      queryPerformanceContext: "",
      iterationGuidance: "",
    });

    const fullPrompt = `${promptConfig.system}\n\n${userPrompt}`;

    try {
      const result = await this.model.generateContent({
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const responseText = result.response.text();
      const parsed = JSON.parse(responseText);

      let queries: GeneratedQuery[] = [];
      if (Array.isArray(parsed)) {
        queries = parsed;
      } else if (parsed.queries && Array.isArray(parsed.queries)) {
        queries = parsed.queries;
      }

      return queries.slice(0, options?.count || 5);
    } catch (error) {
      console.error("Gemini query generation error:", error);
      throw error;
    }
  }

  /**
   * Filter search results based on title/snippet
   */
  async filterSearchResults(
    results: any[],
    projectDescription: string
  ): Promise<any[]> {
    const promptConfig = SEARCH_RESULT_FILTERING_PROMPTS;

    if (results.length === 0) return [];

    const resultsFormatted = results
      .map(
        (r, idx) => `
Result ${idx + 1}:
URL: ${r.url}
Title: ${r.title}
Snippet: ${r.description}
---`
      )
      .join("\n");

    const userPrompt = renderPrompt(promptConfig.user, {
      description: projectDescription,
      results: resultsFormatted,
    });

    const fullPrompt = `${promptConfig.system}\n\n${userPrompt}`;

    try {
      const result = await this.model.generateContent({
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const responseText = result.response.text();
      const parsed = JSON.parse(responseText);

      return parsed.results || [];
    } catch (error) {
      console.error("Gemini search result filtering error:", error);
      // Fallback: keep all results
      return results.map((r) => ({
        url: r.url,
        keep: true,
        reasoning: "Fallback due to error",
      }));
    }
  }

  /**
   * Analyze relevancy
   */
  async analyzeRelevancy(
    description: string,
    contents: ContentToAnalyze[],
    options?: { threshold?: number; batchSize?: number }
  ): Promise<RelevancyResult[]> {
    const promptConfig = RELEVANCY_ANALYSIS_PROMPTS;
    const threshold = options?.threshold || 60;
    const batchSize = options?.batchSize || 5; // Smaller batch size for Gemini Flash to avoid context limits if needed, though Flash has large context

    const results: RelevancyResult[] = [];

    // Process in batches
    for (let i = 0; i < contents.length; i += batchSize) {
      const batch = contents.slice(i, i + batchSize);
      
      const contentsFormatted = batch
        .map(
          (c, idx) =>
            `Content ${idx + 1}:\nURL: ${c.url}\nTitle: ${c.title}\nSnippet: ${c.snippet}\n`
        )
        .join("\n---\n");

      const userPrompt = renderPrompt(promptConfig.user, {
        projectDescription: description,
        requirements: "",
        threshold,
        contentsFormatted,
      });

      const fullPrompt = `${promptConfig.system}\n\n${userPrompt}`;

      try {
        const result = await this.model.generateContent({
          contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
          },
        });

        const responseText = result.response.text();
        const parsed = JSON.parse(responseText);
        
        if (parsed.results && Array.isArray(parsed.results)) {
          // Map back to original URLs if needed, but the prompt asks for URL in result
          results.push(...parsed.results);
        }
      } catch (error) {
        console.error("Gemini relevancy analysis error:", error);
        // Continue with other batches
      }
    }

    return results;
  }

  /**
   * Compile report
   */
  async compileReport(
    description: string,
    results: ResultForReport[],
    options?: { tone?: "professional" | "casual" | "technical"; maxLength?: number }
  ): Promise<CompiledReport> {
    const promptConfig = REPORT_COMPILATION_PROMPTS;
    
    const resultsFormatted = results
      .map(
        (r) =>
          `Source: ${r.title} (${r.url})\nKey Points: ${r.keyPoints.join("; ")}\nSnippet: ${r.snippet}\n`
      )
      .join("\n\n");

    const userPrompt = renderPrompt(promptConfig.user, {
      projectTitle: "Research Report",
      projectDescription: description,
      resultCount: results.length,
      resultsFormatted,
    });

    const fullPrompt = `${promptConfig.system}\n\n${userPrompt}`;

    try {
      // Use a potentially stronger model for reporting if this instance is configured for it, 
      // but here we use the instance's model. 
      // For Pro tier, we might pass a different model name to constructor.
      const result = await this.model.generateContent({
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const responseText = result.response.text();
      const parsed = JSON.parse(responseText);

      return {
        markdown: parsed.markdown,
        title: parsed.title,
        summary: parsed.summary,
        resultCount: results.length,
        averageScore: 0, // Calculated elsewhere
      };
    } catch (error) {
      console.error("Gemini report compilation error:", error);
      throw error;
    }
  }
}
