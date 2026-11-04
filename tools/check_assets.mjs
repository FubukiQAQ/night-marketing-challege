import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(root, 'src/data', p), 'utf8'));
const atlas = J('atlas.json').frames;
const has = (k) => Object.prototype.hasOwnProperty.call(atlas, k);

const problems = [];
const foods = J('foods.json');
foods.forEach((f) => { if (!has(f.sprite)) problems.push('food ' + f.id + ' -> ' + f.sprite); });

J('ingredients.json').ingredients.forEach((i) => {
  if (!has(i.sprite)) problems.push('ing ' + i.id + ' -> ' + i.sprite);
});

J('utensils.json').forEach((u) => { if (!has(u.sprite)) problems.push('utensil ' + u.id + ' -> ' + u.sprite); });

const traits = J('traits.json');
traits.traits.forEach((t) => { if (!has('ico/' + t.icon + '.png')) problems.push('trait ' + t.id + ' -> ' + t.icon); });
traits.resonances.forEach((r) => { if (!has('ico/' + r.icon + '.png')) problems.push('reso ' + r.id + ' -> ' + r.icon); });

// 顾客：8 类 × 5 状态
const TYPES = ['child', 'couple', 'courier', 'drunk', 'elder', 'runner', 'student', 'worker'];
const STATES = ['walk', 'wait', 'urgent', 'happy', 'leave'];
TYPES.forEach((t) => STATES.forEach((s) => {
  const k = 'char/chr_customer_' + t + '_' + s + '.png';
  if (!has(k)) problems.push('char ' + k);
}));

// 标签图标 4 态
J('tags.json').forEach((t) => ['normal', 'grayed', 'highlight', 'fragile'].forEach((m) => {
  const k = 'ico/tag_' + t.id + '_' + m + '.png';
  if (!has(k)) problems.push('tag ico ' + k);
}));

// 场景 3 套 × 5 层
['market', 'prep', 'night'].forEach((sc) => ['far', 'mid', 'ground', 'near', 'light'].forEach((l) => {
  const k = 'scene/scene_' + sc + '_' + l + '.png';
  if (!has(k)) problems.push('scene ' + k);
}));

const total = Object.keys(atlas).length;
console.log('atlas frames:', total);
if (problems.length) {
  console.log('❌ 缺失', problems.length, '项');
  problems.slice(0, 30).forEach((p) => console.log('  ', p));
  process.exit(1);
}
console.log('✅ 全部贴图引用都能解析（餐品/食材/厨具/词条/共鸣/顾客/标签/场景）');
