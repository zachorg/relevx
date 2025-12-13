import { Resend } from "resend";
import { CompiledReport } from "../llm/types";
import { marked } from "marked";

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

    // Convert markdown to HTML
    const markdownHtml = await marked.parse(report.markdown, { async: true });

    // Create a simple HTML version of the report
    // In a real app, we might want to use a proper email template or React Email
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 800px; margin: 0 auto; padding: 20px; }
            h1 { color: #111827; font-size: 24px; margin-bottom: 20px; text-align: center; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
            h2 { color: #374151; font-size: 20px; margin-top: 30px; margin-bottom: 15px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
            h3 { color: #4b5563; font-size: 18px; margin-top: 25px; margin-bottom: 10px; }
            p { margin-bottom: 15px; color: #4b5563; }
            a { color: #2563eb; text-decoration: none; border-bottom: 1px dotted #2563eb; }
            a:hover { text-decoration: underline; }
            ul, ol { margin-bottom: 15px; padding-left: 20px; }
            li { margin-bottom: 5px; color: #4b5563; }
            strong { color: #111827; font-weight: 600; }
            blockquote { border-left: 4px solid #e5e7eb; margin: 0 0 20px; padding: 10px 20px; background: #f9fafb; color: #6b7280; font-style: italic; }
            img { max-width: 100%; height: auto; border-radius: 8px; margin: 15px 0; border: 1px solid #e5e7eb; }
            code { background: #f3f4f6; padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
            pre { background: #f3f4f6; padding: 15px; border-radius: 8px; overflow-x: auto; margin-bottom: 20px; }
            
            .footer { margin-top: 40px; font-size: 12px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 20px; }
          </style>
        </head>
        <body>
          <h1>${report.title}</h1>
          
          <div class="content">
            ${markdownHtml}
          </div>
          
          <div class="footer">
            <p>Sent by Relevx Research Assistant &bull; Project ID: ${projectId}</p>
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
