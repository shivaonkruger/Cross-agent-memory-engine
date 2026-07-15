import { getOpenrouterClient } from "../lib/openrouterClient";
import { MODELS } from "../config/models";
import { withRetry, isRetryableOpenRouterError } from "../utils/retry";
import { insertMessage, getRecentMessagesForAgent } from "./messagesService";
import type { Agent } from "../types/shared";

export async function sendAgentMessage(
  sessionId: string,
  agent: Agent,
  message: string
): Promise<{ responseText: string }> {
  try {
    console.log(`[agentPipe] session=${sessionId} agent=${agent} step=insert_user_message`);
    await insertMessage({ sessionId, agent, role: "user", content: message });

    console.log(`[agentPipe] session=${sessionId} agent=${agent} step=fetch_history`);
    const history = await getRecentMessagesForAgent(sessionId, agent, 20);
    console.log(
      `[agentPipe] session=${sessionId} agent=${agent} step=fetch_history count=${history.length}`
    );

    const openrouterMessages = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    console.log(`[agentPipe] session=${sessionId} agent=${agent} step=call_openrouter model=${MODELS[agent]}`);
    const completion = await withRetry(
      () =>
        getOpenrouterClient().chat.completions.create({
          model: MODELS[agent],
          messages: openrouterMessages,
          max_tokens: 2048,
        }),
      { retries: 2, delayMs: 1000, shouldRetry: isRetryableOpenRouterError }
    );

    const responseText = completion.choices[0]?.message?.content ?? "";
    console.log(`[agentPipe] session=${sessionId} agent=${agent} step=call_openrouter done`);

    console.log(`[agentPipe] session=${sessionId} agent=${agent} step=insert_assistant_message`);
    await insertMessage({ sessionId, agent, role: "assistant", content: responseText });

    return { responseText };
  } catch (err) {
    console.error(`[agentPipe] session=${sessionId} agent=${agent} step=failed`, err);
    throw err;
  }
}
