import { parseMarkdown } from '../markdown';

describe('parseMarkdown', () => {
  it('returns a single text segment for plain text', () => {
    expect(parseMarkdown('hello world')).toEqual([
      { type: 'text', content: 'hello world' },
    ]);
  });

  it('parses inline bold and code', () => {
    expect(parseMarkdown('a **b** `c`')).toEqual([
      { type: 'text', content: 'a ' },
      { type: 'bold', content: 'b' },
      { type: 'text', content: ' ' },
      { type: 'code', content: 'c' },
    ]);
  });

  it('parses *italic*', () => {
    expect(parseMarkdown('look at *any* position')).toEqual([
      { type: 'text', content: 'look at ' },
      { type: 'italic', content: 'any' },
      { type: 'text', content: ' position' },
    ]);
  });

  it('shows bullets as • and headings as bold, without reading a bullet star as italic', () => {
    expect(parseMarkdown('## Goals\n- centre\n* king safety')).toEqual([
      { type: 'bold', content: 'Goals' },
      { type: 'text', content: '\n•  centre\n•  king safety' },
    ]);
  });

  it('parses a fenced code block with language', () => {
    expect(parseMarkdown('```ts\nconst x = 1;\n```')).toEqual([
      { type: 'codeblock', lang: 'ts', content: 'const x = 1;\n' },
    ]);
  });
});
