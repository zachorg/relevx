import { Resend } from "resend";
import { CompiledReport } from "../llm/types";

// Initialize Resend client
// We'll lazily initialize this to avoid errors if the API key is missing during build/test
let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not set in environment variables");
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

/**
 * Send a research report via email
 */
export async function sendReportEmail(
  to: string,
  report: CompiledReport,
  projectId: string
): Promise<{ success: boolean; id?: string; error?: any }> {
  try {
    const resend = getResendClient();

    // Create a simple HTML version of the report
    // In a real app, we might want to use a proper email template or React Email
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: sans-serif; line-height: 1.6; color: #333; }
            h1 { color: #2563eb; }
            .summary { background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
            .footer { margin-top: 30px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 10px; }
            .score { font-weight: bold; color: #059669; }
          </style>
        </head>
        <body>
          <h1>${report.title}</h1>
          
          <div class="summary">
            <h3>Executive Summary</h3>
            <p>${report.summary}</p>
            <p><strong>Average Relevancy Score:</strong> <span class="score">${
              report.averageScore
            }/100</span></p>
            <p><strong>Results Found:</strong> ${report.resultCount}</p>
          </div>
          
          <div>
            ${report.markdown.replace(/\n/g, "<br>")}
          </div>
          
          <div class="footer">
            <p>Sent by Relevx Research Assistant</p>
            <p>Project ID: ${projectId}</p>
          </div>
        </body>
      </html>
    `;

    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!fromEmail) {
      throw new Error("RESEND_FROM_EMAIL is not set in environment variables");
    }

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [to],
      subject: `Research Report: ${report.title}`,
      html: htmlContent,
    });

    if (error) {
      console.error("Error sending email:", error);
      return { success: false, error };
    }

    return { success: true, id: data?.id };
  } catch (error) {
    console.error("Failed to send email:", error);
    return { success: false, error };
  }
}
