import { flattenOutline } from '../outline';

const tree = [
  {
    title: 'Chapter 1',
    page: 1,
    children: [
      { title: 'Section 1.1', page: 2, children: [] },
      { title: 'Section 1.2', page: 3, children: [] },
    ],
  },
  { title: 'Chapter 2', page: 5, children: [] },
  { title: 'Chapter 3', page: 9, children: [] },
];

describe('flattenOutline', () => {
  it('flattens in pre-order with path keys', () => {
    expect(flattenOutline(tree)).toEqual([
      { key: '0', title: 'Chapter 1', page: 1, depth: 0 },
      { key: '0.0', title: 'Section 1.1', page: 2, depth: 1 },
      { key: '0.1', title: 'Section 1.2', page: 3, depth: 1 },
      { key: '1', title: 'Chapter 2', page: 5, depth: 0 },
      { key: '2', title: 'Chapter 3', page: 9, depth: 0 },
    ]);
  });
  it('clamps depth', () => {
    const deep = {
      title: 'a',
      page: 1,
      children: [{ title: 'b', page: 1, children: [{ title: 'c', page: 1, children: [] }] }],
    };
    expect(flattenOutline([deep], 1).map((r) => r.depth)).toEqual([0, 1, 1]);
  });
});
