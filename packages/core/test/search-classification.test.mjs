import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifySearchResult, normalizeSearxng } from '../dist/search.js';

const cases = [
  ['https://example.net/start', 'Getting started with a database', '', 'Docs'],
  ['https://example.net/post', 'Tutorial: streaming events', '', 'Articles'],
  ['https://example.net/api', 'Widget API reference', '', 'Docs'],
  ['https://example.net/page', 'Widgets', 'This guide explains installation.', 'Docs'],
  ['https://example.net/guide/setup', 'Setup', '', 'Docs'],
  ['https://example.net/handbook/types', 'Types', '', 'Docs'],
  ['https://example.net/book/chapter-1', 'Chapter one', '', 'Docs'],
  ['https://example.net/spec.pdf', 'Specifications', '', 'Docs'],
  ['https://en.wikipedia.org/wiki/Compiler', 'Compiler', '', 'Docs'],
  ['https://pypi.org/project/widgets/', 'Widgets', '', 'All'],
  ['https://sourceforge.net/projects/widgets/', 'Widgets', '', 'All'],
  ['https://example.net/', 'An open-source library for sorting', '', 'All'],
  ['https://example.net/', 'Widgets', 'Widgets is a programming language.', 'All'],
  ['https://www.zhihu.com/question/1234', '讨论标题', '', 'All'],
  ['https://community.example.net/t/123', 'Installation tutorial question', '', 'All'],
  ['https://github.com/org/project/issues/123/docs', 'Documentation bug', '', 'All'],
  ['https://example.net/discussions/123', 'API reference problem', '', 'All'],
  ['https://example.net/thread', 'Forum discussion about widgets', '', 'All'],
  ['https://chatgpt.com/', 'ChatGPT', '', 'Applications'],
  ['https://gemini.google.com/app', 'Gemini', '', 'Applications'],
  ['https://docs.chatgpt.com/api', 'API', '', 'Docs'],
  ['https://example.net/blog/tutorial', 'API tutorial', '', 'Articles'],
  ['https://example.net/articles/chatgpt', 'ChatGPT', '', 'Articles'],
  ['https://medium.com/@author/post', 'An opinion', '', 'Articles'],
  ['https://example.net/post-123', 'A case study', '', 'Articles'],
  ['https://online-python.com/', 'Online Python editor', '', 'Applications'],
  ['https://example.net/', 'Browser-based tool', '', 'Applications'],
  ['https://youtube.com/watch?v=123', 'API tutorial', '', 'Videos'],
  ['https://youtu.be/123', 'Clip', '', 'Videos'],
  ['https://www.youtube.com/shorts/123', 'Clip', '', 'Videos'],
  ['https://vimeo.com/12345', 'Clip', '', 'Videos'],
  ['https://example.net/videos/123', 'Clip', '', 'Videos'],
  ['https://example.net/blog/video-editing', 'Video editing tutorial', '', 'Articles'],
  ['https://chatgpt.com.example.net/', 'Sale', '', 'All'],
  ['https://github.com/org/project', 'How to get started', '', 'All'],
  ['https://github.com/org/project/docs/setup', 'Documentation', '', 'Docs'],
  ['https://shop.example.net/', 'Buy a laptop', 'Read reviews and compare prices.', 'All'],
  ['https://example.net/', 'Widgets', 'A popular widget service.', 'All'],
  ['https://example.net/', 'Library café', '', 'All'],
  ['https://example.net/', 'A guidebook for sale', '', 'All'],
  ['https://example.net/', 'My next project', 'Discuss ideas with friends.', 'All'],
  ['https://wikipedia.org.example.net/wiki/Compiler', 'Sale', '', 'All'],
  ['https://pypi.org.example.net/project/widget', 'Sale', '', 'All'],
  ['https://example.net/?url=https://docs.example.net/tutorial', 'Sale', '', 'All'],
  ['https://www.zhihu.com/', '知乎', '', 'All'],
  ['https://example.net/', '', '', 'All'],
];
for (const [url, title, excerpt, expected] of cases) {
  test(`classifies ${url} with title ${title}`, () => {
    assert.equal(classifySearchResult(new URL(url), title, excerpt), expected);
  });
}

test('custom search responses use metadata classification after cleaning HTML', () => {
  const response = normalizeSearxng({ results: [
    { url: 'https://example.net/page', title: '<b>Widget tutorial</b>', content: '<p>Steps</p>' },
    { url: 'https://example.net/', title: 'Widget service', content: 'Run widgets online.' },
  ] });
  assert.deepEqual(response.results.map(row => row.kind), ['Docs', 'All']);
});
