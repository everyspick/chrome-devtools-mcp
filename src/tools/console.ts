/**
 * Console tool for Chrome DevTools MCP
 * Captures console messages and evaluates JavaScript expressions in the browser context
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Page } from 'puppeteer-core';

export const consoleToolDefinition: Tool = {
  name: 'console',
  description:
    'Evaluate JavaScript in the browser console and retrieve console output. ' +
    'Returns the result of the expression and any console messages logged during evaluation.',
  inputSchema: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'JavaScript expression to evaluate in the browser context',
      },
      awaitPromise: {
        type: 'boolean',
        description: 'Whether to await the result if it is a Promise (default: true)',
        default: true,
      },
    },
    required: ['expression'],
  },
};

interface ConsoleMessage {
  type: string;
  text: string;
}

interface EvaluateResult {
  result: unknown;
  consoleMessages: ConsoleMessage[];
  error?: string;
}

/**
 * Evaluates a JavaScript expression in the page context and captures console output.
 *
 * @param page - Puppeteer Page instance
 * @param expression - JavaScript expression to evaluate
 * @param awaitPromise - Whether to await Promise results
 * @returns Evaluation result and captured console messages
 */
export async function evaluateExpression(
  page: Page,
  expression: string,
  awaitPromise = true
): Promise<EvaluateResult> {
  const consoleMessages: ConsoleMessage[] = [];

  // Capture console messages during evaluation
  const messageHandler = (msg: { type: () => string; text: () => string }) => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text(),
    });
  };

  page.on('console', messageHandler);

  try {
    const result = await page.evaluate(
      async ({ expr, shouldAwait }: { expr: string; shouldAwait: boolean }) => {
        try {
          // eslint-disable-next-line no-eval
          const value = eval(expr);
          if (shouldAwait && value instanceof Promise) {
            return { success: true, value: await value };
          }
          return { success: true, value };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
      { expr: expression, shouldAwait: awaitPromise }
    );

    if (!result.success) {
      return {
        result: undefined,
        consoleMessages,
        error: result.error,
      };
    }

    return {
      result: result.value,
      consoleMessages,
    };
  } catch (err) {
    return {
      result: undefined,
      consoleMessages,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    page.off('console', messageHandler);
  }
}

/**
 * Formats the evaluation result into a human-readable string.
 */
export function formatEvaluateResult(result: EvaluateResult): string {
  const parts: string[] = [];

  if (result.consoleMessages.length > 0) {
    parts.push('Console output:');
    for (const msg of result.consoleMessages) {
      parts.push(`  [${msg.type}] ${msg.text}`);
    }
  }

  if (result.error) {
    parts.push(`Error: ${result.error}`);
  } else {
    const serialized =
      result.result === undefined
        ? 'undefined'
        : JSON.stringify(result.result, null, 2);
    parts.push(`Result: ${serialized}`);
  }

  return parts.join('\n');
}
