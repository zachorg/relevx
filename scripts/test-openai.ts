/**
 * Test script for OpenAI service
 *
 * Usage:
 *   ts-node scripts/test-openai.ts
 *
 * Environment variables required:
 *   OPENAI_API_KEY
 */

// Load environment variables from .env file
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

import {
  initializeOpenAI,
  generateSearchQueries,
  analyzeRelevancy,
  compileReport,
  type ContentToAnalyze,
  type ResultForReport,
} from "../packages/core/src/services/llm";

async function testQueryGeneration() {
  console.log("\n=== Testing Query Generation ===\n");

  const description =
    "Latest developments in AI language models and their applications in software development";

  const searchParams = {
    requiredKeywords: ["AI", "language models"],
    language: "en",
  };

  try {
    const queries = await generateSearchQueries(description, searchParams);

    console.log(`✓ Generated ${queries.length} queries:\n`);
    queries.forEach((q, idx) => {
      console.log(`${idx + 1}. [${q.type}] ${q.query}`);
      console.log(`   Reasoning: ${q.reasoning}\n`);
    });

    return queries;
  } catch (error: any) {
    console.error("✗ Query generation failed:", error.message);
    throw error;
  }
}

async function testRelevancyAnalysis() {
  console.log("\n=== Testing Relevancy Analysis ===\n");

  const contents: ContentToAnalyze[] = [
    {
      url: "https://example.com/ai-article-1",
      title: "GPT-4 Revolutionizes Software Development",
      snippet:
        "GPT-4 has introduced groundbreaking capabilities in code generation, debugging, and documentation. Developers are now using AI assistants to accelerate their workflow and improve code quality. The model's understanding of context and ability to generate accurate code snippets has made it an invaluable tool.",
      publishedDate: "2024-01-15",
    },
    {
      url: "https://example.com/recipe",
      title: "Best Chocolate Chip Cookie Recipe",
      snippet:
        "Learn how to make the perfect chocolate chip cookies with this easy recipe. Mix butter, sugar, eggs, and flour together. Add chocolate chips and bake at 350 degrees for 12 minutes.",
      publishedDate: "2024-01-10",
    },
    {
      url: "https://example.com/ai-article-2",
      title: "AI Language Models in Production",
      snippet:
        "Companies are integrating language models into their production systems. This article explores best practices, cost optimization, and scaling strategies for deploying AI models in enterprise environments.",
      publishedDate: "2024-01-20",
    },
  ];

  const description =
    "Latest developments in AI language models and their applications in software development";

  try {
    const results = await analyzeRelevancy(
      contents,
      description,
      undefined,
      60
    );

    console.log("Relevancy Analysis Results:\n");
    results.forEach((result) => {
      const status = result.isRelevant ? "✓ RELEVANT" : "✗ NOT RELEVANT";
      console.log(`${status} (Score: ${result.score}/100)`);
      console.log(`URL: ${result.url}`);
      console.log(`Reasoning: ${result.reasoning}`);
      console.log(`Key Points: ${result.keyPoints.join(", ")}\n`);
    });

    return results;
  } catch (error: any) {
    console.error("✗ Relevancy analysis failed:", error.message);
    throw error;
  }
}

async function testReportCompilation() {
  console.log("\n=== Testing Report Compilation ===\n");

  const results: ResultForReport[] = [
    {
      url: "https://example.com/ai-article-1",
      title: "GPT-4 Revolutionizes Software Development",
      snippet:
        "GPT-4 has introduced groundbreaking capabilities in code generation, debugging, and documentation.",
      score: 95,
      keyPoints: [
        "Code generation capabilities",
        "Improved developer workflow",
        "Context understanding",
      ],
      publishedDate: "2024-01-15",
      author: "John Doe",
    },
    {
      url: "https://example.com/ai-article-2",
      title: "AI Language Models in Production",
      snippet:
        "Companies are integrating language models into their production systems with best practices for scaling.",
      score: 88,
      keyPoints: [
        "Production deployment",
        "Cost optimization",
        "Enterprise scaling",
      ],
      publishedDate: "2024-01-20",
      author: "Jane Smith",
    },
  ];

  const projectTitle = "AI Language Models Research";
  const projectDescription =
    "Latest developments in AI language models and their applications in software development";

  try {
    const report = await compileReport(
      results,
      projectTitle,
      projectDescription
    );

    console.log("✓ Report compiled successfully!\n");
    console.log(`Title: ${report.title}`);
    console.log(`Summary: ${report.summary}`);
    console.log(`Result Count: ${report.resultCount}`);
    console.log(`Average Score: ${report.averageScore}\n`);
    console.log("=== Markdown Report ===\n");
    console.log(report.markdown);

    return report;
  } catch (error: any) {
    console.error("✗ Report compilation failed:", error.message);
    throw error;
  }
}

async function main() {
  console.log("===========================================");
  console.log("    OpenAI Service Test Suite");
  console.log("===========================================");

  // Check for API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("\n✗ Error: OPENAI_API_KEY environment variable not set");
    console.error("Please set it before running this test:\n");
    console.error("  export OPENAI_API_KEY=your-api-key\n");
    process.exit(1);
  }

  // Initialize OpenAI
  console.log("\n✓ Initializing OpenAI client...");
  initializeOpenAI(apiKey);

  try {
    // Run tests
    await testQueryGeneration();
    await testRelevancyAnalysis();
    await testReportCompilation();

    console.log("\n===========================================");
    console.log("    ✓ All tests completed successfully!");
    console.log("===========================================\n");
  } catch (error: any) {
    console.error("\n===========================================");
    console.error("    ✗ Test suite failed");
    console.error("===========================================\n");
    console.error("Error:", error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
