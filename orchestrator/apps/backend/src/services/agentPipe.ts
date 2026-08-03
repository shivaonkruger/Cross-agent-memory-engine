import { getOpenrouterClient } from "../lib/openrouterClient";
import { MODELS } from "../config/models";
import { withRetry, isRetryableOpenRouterError } from "../utils/retry";
import { insertMessage } from "./messagesService";
import { getAgentConversationContext } from "./conversationMemory";
import { buildEnrichedSystemPrompt } from "./contextInjector";
import type { Agent } from "../types/shared";

export async function sendAgentMessage(
  sessionId: string,
  agent: Agent,
  message: string
): Promise<{ responseText: string }> {
  try {
    // Fetched BEFORE inserting this turn's user message, so the recency
    // window/summary reflect prior turns only — the current message is
    // appended once, explicitly, below. (Fetching after the insert would
    // double it up, since it would already be in the "uncovered" set.)
    console.log(`[agentPipe] session=${sessionId} agent=${agent} step=fetch_conversation_context`);
    const { summary, recentMessages } = await getAgentConversationContext(sessionId, agent);

    console.log(`[agentPipe] session=${sessionId} agent=${agent} step=build_system_prompt`);
    const systemPrompt = await buildEnrichedSystemPrompt(sessionId, agent);

    const conversationSummarySection = summary
      ? `\n\n[YOUR CONVERSATION SO FAR WITH THE USER]\n${summary}`
      : "";
    const finalSystemPrompt = systemPrompt + conversationSummarySection;
    console.log(
      `[agentPipe] session=${sessionId} agent=${agent} step=system_prompt_built\n${finalSystemPrompt}`
    );

    console.log(
      `agentPipe: using recency window of ${recentMessages.length} messages + summary of length ${summary.length} for session ${sessionId}, agent ${agent}`
    );

    console.log(`[agentPipe] session=${sessionId} agent=${agent} step=insert_user_message`);
    await insertMessage({ sessionId, agent, role: "user", content: message });

    const openrouterMessages = [
      { role: "system" as const, content: finalSystemPrompt },
      ...recentMessages,
      { role: "user" as const, content: message },
    ];

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
