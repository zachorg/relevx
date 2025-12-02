/**
 * Test script for full research flow
 *
 * Usage:
 *   ts-node scripts/test-research.ts [projectId] [userId]
 *
 * Or for a quick test with mock data:
 *   ts-node scripts/test-research.ts --mock
 *
 * Environment variables required:
 *   OPENAI_API_KEY
 *   BRAVE_SEARCH_API_KEY
 *   FIREBASE_PROJECT_ID (optional for mock mode)
 */

// Load environment variables from .env file
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

import {
  executeResearchForProject,
  setDefaultProviders,
} from "../packages/core/src/services/research-engine";
import { createOpenAIProvider } from "../packages/core/src/services/llm";
import { createBraveSearchProvider } from "../packages/core/src/services/search";

async function testMockResearch() {
  console.log("\n=== Testing Research Flow (Mock Mode) ===\n");
  console.log("This will test each component individually:\n");

  // Test 1: Query Generation
  console.log("1. Testing Query Generation...");
  const { generateSearchQueriesWithRetry } = await import("../packages/core/src/services/llm");

  const queries = await generateSearchQueriesWithRetry(
    "Latest developments in web development frameworks and best practices",
    {
      requiredKeywords: ["web development", "frameworks"],
      language: "en",
    }
  );

  console.log(`   ✓ Generated ${queries.length} queries\n`);

  // Test 2: Search Execution
  console.log("2. Testing Search Execution...");
  const { searchMultipleQueries } = await import("../packages/core/src/services/brave-search");

  const searchResults = await searchMultipleQueries(
    queries.slice(0, 2).map((q) => q.query),
    { count: 5, language: "en" }
  );

  let totalResults = 0;
  for (const response of searchResults.values()) {
    totalResults += response.results.length;
  }
  console.log(`   ✓ Found ${totalResults} search results\n`);

  // Test 3: Content Extraction
  console.log("3. Testing Content Extraction...");
  const { extractMultipleContents } = await import(
    "../packages/core/src/services/content-extractor"
  );

  const urls: string[] = [];
  for (const response of searchResults.values()) {
    urls.push(...response.results.slice(0, 3).map((r) => r.url));
  }

  const extractedContents = await extractMultipleContents(
    urls.slice(0, 5),
    undefined,
    2
  );

  const successfulExtractions = extractedContents.filter(
    (c) => c.fetchStatus === "success" && c.snippet.length > 0
  );
  console.log(
    `   ✓ Extracted ${successfulExtractions.length}/${extractedContents.length} URLs successfully\n`
  );

  // Test 4: Relevancy Analysis
  console.log("4. Testing Relevancy Analysis...");
  const { analyzeRelevancyWithRetry } = await import("../packages/core/src/services/llm");

  const contentsToAnalyze = successfulExtractions.map((c) => ({
    url: c.url,
    title: c.title,
    snippet: c.snippet,
    publishedDate: c.metadata.publishedDate,
  }));

  const relevancyResults = await analyzeRelevancyWithRetry(
    contentsToAnalyze,
    "Latest developments in web development frameworks and best practices"
  );

  const relevantResults = relevancyResults.filter((r) => r.isRelevant);
  console.log(
    `   ✓ Found ${relevantResults.length} relevant results (threshold: 60)\n`
  );

  // Test 5: Report Compilation
  if (relevantResults.length > 0) {
    console.log("5. Testing Report Compilation...");
    const { compileReportWithRetry } = await import("../packages/core/src/services/llm");

    const resultsForReport = relevantResults.map((r) => ({
      url: r.url,
      title: successfulExtractions.find((c) => c.url === r.url)?.title,
      snippet: r.keyPoints.join(". "),
      score: r.score,
      keyPoints: r.keyPoints,
    }));

    const report = await compileReportWithRetry(
      resultsForReport,
      "Web Development Research",
      "Latest developments in web development frameworks and best practices"
    );

    console.log(`   ✓ Report compiled successfully\n`);
    console.log(`\n${"=".repeat(60)}`);
    console.log(
      `FULL REPORT (${report.resultCount} results, avg score: ${report.averageScore})`
    );
    console.log(`${"=".repeat(60)}\n`);
    console.log(report.markdown);
    console.log(`\n${"=".repeat(60)}\n`);
  }

  console.log("✓ Mock research flow completed successfully!\n");
}

async function testFullResearch(userId: string, projectId: string) {
  console.log("\n=== Testing Full Research Flow ===\n");
  console.log(`User ID: ${userId}`);
  console.log(`Project ID: ${projectId}\n`);

  const startTime = Date.now();

  try {
    const result = await executeResearchForProject(userId, projectId, {
      maxIterations: 2, // Limit to 2 iterations for testing
      concurrentExtractions: 2,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("\n=== Research Results ===\n");
    console.log(`Status: ${result.success ? "✓ SUCCESS" : "✗ FAILED"}`);
    console.log(`Duration: ${duration}s`);
    console.log(`Iterations: ${result.iterationsUsed}`);
    console.log();

    console.log("Queries:");
    console.log(`  Generated: ${result.queriesGenerated.length}`);
    console.log(`  Executed: ${result.queriesExecuted.length}`);
    console.log();

    console.log("URLs:");
    console.log(`  Fetched: ${result.urlsFetched}`);
    console.log(`  Successful: ${result.urlsSuccessful}`);
    console.log(`  Relevant: ${result.urlsRelevant}`);
    console.log();

    console.log("Results:");
    console.log(`  Total Analyzed: ${result.totalResultsAnalyzed}`);
    console.log(`  Included in Report: ${result.relevantResults.length}`);
    console.log();

    if (result.relevantResults.length > 0) {
      console.log("Top Results:");
      result.relevantResults.slice(0, 5).forEach((r, idx) => {
        console.log(`  ${idx + 1}. [${r.relevancyScore}] ${r.metadata.title}`);
        console.log(`     ${r.url}`);
      });
      console.log();
    }

    if (result.report) {
      console.log("Report Generated:");
      console.log(`  Title: ${result.report.title}`);
      console.log(`  Result Count: ${result.relevantResults.length}`);
      console.log(`  Average Score: ${result.report.averageScore}`);
      console.log();
      console.log(`${"=".repeat(60)}`);
      console.log("FULL MARKDOWN REPORT");
      console.log(`${"=".repeat(60)}\n`);
      console.log(result.report.markdown);
      console.log(`\n${"=".repeat(60)}\n`);
    }

    if (result.error) {
      console.error(`Error: ${result.error}`);
    }

    return result;
  } catch (error: any) {
    console.error("\n✗ Research execution failed:", error.message);
    throw error;
  }
}

async function main() {
  console.log("===========================================");
  console.log("    Full Research Flow Test");
  console.log("===========================================");

  const args = process.argv.slice(2);

  // Check for mock mode
  if (args[0] === "--mock") {
    // Check for API keys
    const openaiKey = process.env.OPENAI_API_KEY;
    const braveKey = process.env.BRAVE_SEARCH_API_KEY;

    if (!openaiKey || !braveKey) {
      console.error("\n✗ Error: Required API keys not set");
      console.error("Please set these environment variables:\n");
      console.error("  export OPENAI_API_KEY=your-openai-key");
      console.error("  export BRAVE_SEARCH_API_KEY=your-brave-key\n");
      process.exit(1);
    }

    // Initialize providers
    console.log("\n✓ Initializing providers...");
    const llmProvider = createOpenAIProvider(openaiKey);
    const searchProvider = createBraveSearchProvider(braveKey);
    setDefaultProviders(llmProvider, searchProvider);

    try {
      await testMockResearch();

      console.log("\n===========================================");
      console.log("    ✓ Test completed successfully!");
      console.log("===========================================\n");
    } catch (error: any) {
      console.error("\n===========================================");
      console.error("    ✗ Test failed");
      console.error("===========================================\n");
      console.error("Error:", error.message);
      process.exit(1);
    }
    return;
  }

  // Full research mode with real project
  if (args.length < 2) {
    console.error("\n✗ Error: Missing arguments");
    console.error("\nUsage:");
    console.error("  Mock mode:  ts-node test-research.ts --mock");
    console.error(
      "  Real mode:  ts-node test-research.ts <projectId> <userId>\n"
    );
    process.exit(1);
  }

  const [projectId, userId] = args;

  // Check for API keys
  const openaiKey = process.env.OPENAI_API_KEY;
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;

  if (!openaiKey || !braveKey) {
    console.error("\n✗ Error: Required API keys not set");
    console.error("Please set these environment variables:\n");
    console.error("  export OPENAI_API_KEY=your-openai-key");
    console.error("  export BRAVE_SEARCH_API_KEY=your-brave-key\n");
    process.exit(1);
  }

  // Initialize providers
  console.log("\n✓ Initializing providers...");
  const llmProvider = createOpenAIProvider(openaiKey);
  const searchProvider = createBraveSearchProvider(braveKey);
  setDefaultProviders(llmProvider, searchProvider);

  try {
    await testFullResearch(userId, projectId);

    console.log("\n===========================================");
    console.log("    ✓ Test completed successfully!");
    console.log("===========================================\n");
  } catch (error: any) {
    console.error("\n===========================================");
    console.error("    ✗ Test failed");
    console.error("===========================================\n");
    console.error("Error:", error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
