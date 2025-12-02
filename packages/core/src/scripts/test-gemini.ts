/**
 * Test script for Gemini Provider
 * Run with: npx tsx packages/core/src/scripts/test-gemini.ts
 */

import * as dotenv from "dotenv";
import path from "path";
import { GeminiProvider } from "../services/gemini/provider";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

async function testGemini() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    console.error("Error: GOOGLE_GENERATIVE_AI_API_KEY not set in .env");
    process.exit(1);
  }

  console.log("Initializing Gemini Provider...");
  const provider = new GeminiProvider(apiKey);

  try {
    // Test 1: Query Generation
    console.log("\n--- Testing Query Generation ---");
    const queries = await provider.generateSearchQueries(
      "The impact of artificial intelligence on software engineering jobs in the next 5 years",
      undefined,
      { count: 3 }
    );
    console.log("Generated Queries:", JSON.stringify(queries, null, 2));

    if (queries.length > 0) {
      console.log("✅ Query Generation Passed");
    } else {
      console.error("❌ Query Generation Failed: No queries returned");
    }

    // Test 2: Relevancy Analysis
    console.log("\n--- Testing Relevancy Analysis ---");
    const mockContent = [
      {
        url: "https://example.com/ai-jobs",
        title: "AI and the Future of Work",
        snippet:
          "Artificial intelligence is transforming the software engineering landscape. While some tasks will be automated, new roles will emerge focusing on AI system management and ethical oversight.",
      },
      {
        url: "https://example.com/irrelevant",
        title: "Best Pizza Recipes",
        snippet:
          "Here are the top 10 pizza recipes for your next party. Pepperoni, cheese, and more.",
      },
    ];

    const relevancyResults = await provider.analyzeRelevancy(
      "The impact of artificial intelligence on software engineering jobs in the next 5 years",
      mockContent
    );
    console.log("Relevancy Results:", JSON.stringify(relevancyResults, null, 2));

    if (relevancyResults.length > 0) {
      console.log("✅ Relevancy Analysis Passed");
    } else {
      console.error("❌ Relevancy Analysis Failed: No results returned");
    }

    // Test 3: Report Compilation
    console.log("\n--- Testing Report Compilation ---");
    const mockResults = [
      {
        url: "https://example.com/ai-jobs",
        title: "AI and the Future of Work",
        snippet:
          "Artificial intelligence is transforming the software engineering landscape.",
        score: 95,
        keyPoints: ["AI transforms landscape", "New roles emerging"],
      },
    ];

    const report = await provider.compileReport(
      "The impact of artificial intelligence on software engineering jobs in the next 5 years",
      mockResults
    );
    console.log("Report Summary:", report.summary);
    console.log("Report Title:", report.title);
    
    if (report.markdown && report.markdown.length > 0) {
      console.log("✅ Report Compilation Passed");
    } else {
      console.error("❌ Report Compilation Failed: No markdown returned");
    }

  } catch (error) {
    console.error("Test Failed:", error);
  }
}

testGemini();
