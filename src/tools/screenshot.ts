/**
 * Screenshot tool for Chrome DevTools MCP
 * Captures screenshots of the current page or specific elements
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const screenshotTool: Tool = {
  name: 'screenshot',
  description: 'Capture a screenshot of the current page or a specific element',
  inputSchema: {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'CSS selector for a specific element to screenshot (optional, defaults to full page)',
      },
      format: {
        type: 'string',
        enum: ['png', 'jpeg', 'webp'],
        description: 'Image format for the screenshot (default: png)',
      },
      quality: {
        type: 'number',
        minimum: 0,
        maximum: 100,
        description: 'Image quality for jpeg/webp formats (0-100, default: 80)',
      },
      fullPage: {
        type: 'boolean',
        description: 'Capture the full scrollable page (default: false)',
      },
    },
    required: [],
  },
};

export interface ScreenshotOptions {
  selector?: string;
  format?: 'png' | 'jpeg' | 'webp';
  quality?: number;
  fullPage?: boolean;
}

/**
 * Handles the screenshot tool execution via Chrome DevTools Protocol
 */
export async function handleScreenshot(
  session: { send: (method: string, params?: Record<string, unknown>) => Promise<unknown> },
  options: ScreenshotOptions = {}
): Promise<{ data: string; mimeType: string }> {
  const { selector, format = 'png', quality = 80, fullPage = false } = options;

  // Enable Page domain if not already enabled
  await session.send('Page.enable');

  let clip: Record<string, number> | undefined;

  if (selector) {
    // Get element bounds for targeted screenshot
    const { result } = (await session.send('Runtime.evaluate', {
      expression: `
        (function() {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        })()
      `,
      returnByValue: true,
    })) as { result: { value: Record<string, number> | null } };

    if (!result.value) {
      throw new Error(`Element not found for selector: ${selector}`);
    }

    clip = {
      x: result.value.x,
      y: result.value.y,
      width: result.value.width,
      height: result.value.height,
      scale: 1,
    };
  } else if (fullPage) {
    // Get full page dimensions
    const { result } = (await session.send('Runtime.evaluate', {
      expression: `({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })`,
      returnByValue: true,
    })) as { result: { value: { width: number; height: number } } };

    clip = {
      x: 0,
      y: 0,
      width: result.value.width,
      height: result.value.height,
      scale: 1,
    };
  }

  const captureParams: Record<string, unknown> = {
    format,
    ...(format !== 'png' && { quality }),
    ...(clip && { clip }),
    captureBeyondViewport: fullPage || !!selector,
  };

  const { data } = (await session.send('Page.captureScreenshot', captureParams)) as {
    data: string;
  };

  const mimeTypeMap: Record<string, string> = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  };

  return {
    data,
    mimeType: mimeTypeMap[format],
  };
}
