// 从 cn-math-taxonomy 抽取口算练习需要的知识图谱子集，输出成浏览器可直接内联的 JS。
// 用法: node tools/extract.js <taxonomyRepoDir>
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2] || '.';
const read = f => JSON.parse(fs.readFileSync(path.join(SRC, 'data', f), 'utf8'));

const topics = read('topics.json');
const deps = read('dependencies.json');
const questions = read('questions.json');
const hujiao = read('mappings/hujiao_math.json');

const isPrimary = t => /^cnm_p\d+$/.test(t.id);
const byId = Object.fromEntries(topics.map(t => [t.id, t]));

// 种子：小学「数与代数」1-2 年级；再沿先修边做闭包，保证回溯诊断可用
const seeds = topics.filter(t => isPrimary(t) && t.domain === '数与代数' && t.grade <= 2);
const keep = new Set(seeds.map(t => t.id));
const frontier = [...keep];
while (frontier.length) {
  const id = frontier.pop();
  for (const d of deps) {
    if (d.topicId === id && byId[d.prerequisiteId] && !keep.has(d.prerequisiteId)) {
      keep.add(d.prerequisiteId);
      frontier.push(d.prerequisiteId);
    }
  }
}

const hujLabel = {};
for (const e of hujiao.entries) {
  hujLabel[e.topicId] = { unit: e.unit, chapter: e.chapter, note: e.note || '' };
}

const outTopics = topics
  .filter(t => keep.has(t.id))
  .sort((a, b) => a.grade - b.grade || a.id.localeCompare(b.id, 'en', { numeric: true }))
  .map(t => ({
    id: t.id,
    name: t.name,
    domain: t.domain,
    grade: t.grade,
    term: t.semester,
    chapter: t.chapter,
    type: t.type,
    desc: t.description,
    mastery: t.mastery_criteria || [],
    huj: hujLabel[t.id] || null,
  }));

const outDeps = deps
  .filter(d => keep.has(d.topicId) && keep.has(d.prerequisiteId))
  .map(d => ({ from: d.topicId, to: d.prerequisiteId, s: d.strength }));

const outQs = questions
  .filter(q => keep.has(q.topicId))
  .map(q => {
    const o = { id: q.id, t: q.topicId, p: q.prompt, a: q.answer, e: q.explanation, d: q.difficulty, y: q.type, v: q.verify };
    if (q.choices) o.c = q.choices.map(c => [c.key, c.text]);
    if (q.accept) o.acc = q.accept;
    if (q.figure) o.fig = q.figure;
    if (q.hideChoiceText) o.hct = 1;
    return o;
  });

const payload = {
  generated: new Date().toISOString().slice(0, 10),
  source: 'xiaoyang111222/cn-math-taxonomy (CC BY-NC 4.0)',
  textbook: hujiao.label,
  topics: outTopics,
  deps: outDeps,
  bank: outQs,
};

const body = 'window.KG = ' + JSON.stringify(payload) + ';\n';
fs.writeFileSync(path.join(__dirname, '..', 'js', 'graph.data.js'), body);

console.log('topics', outTopics.length, '| edges', outDeps.length, '| bank', outQs.length);
console.log('bytes', (body.length / 1024).toFixed(0) + 'KB');
console.log('g1数与代数:', outTopics.filter(t => t.grade === 1).map(t => `${t.id} ${t.name}`).join('\n  '));
