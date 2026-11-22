// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { getFieldText, setFieldText, setNativeValue } from './field';

describe('field read/write', () => {
  it('uses the native setter so framework-controlled inputs notice', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const events: string[] = [];
    input.addEventListener('input', () => events.push('input'));
    setNativeValue(input, 'hello [EMAIL]');
    expect(input.value).toBe('hello [EMAIL]');
    expect(events).toEqual(['input']);
    expect(getFieldText(input)).toBe('hello [EMAIL]');
  });

  it('writes contenteditable text through execCommand so editors see it', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.innerText = 'my email is a@b.com';
    document.body.appendChild(div);
    const exec = vi.fn(() => true);
    document.execCommand = exec as never;
    setFieldText(div, 'my email is [EMAIL]');
    expect(exec).toHaveBeenCalledWith('insertText', false, 'my email is [EMAIL]');
  });
});
