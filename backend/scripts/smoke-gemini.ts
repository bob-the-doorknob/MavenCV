import { generateCvBullet } from '../src/services/cvBullet.js';
import { generateRoadmap } from '../src/services/roadmap.js';

const roadmap = await generateRoadmap({
  experience: 'Built two TypeScript APIs and used PostgreSQL in coursework.',
  targetRole: { title: 'Backend Engineer' },
  targetIndustry: 'Fintech',
});
if (roadmap.tasks.length < 5 || roadmap.tasks.length > 7) throw new Error('Roadmap contract failed');

const cv = await generateCvBullet({
  taskTitle: 'Deploy 1 app to Cloud Run',
  notes: 'Deployed a course project app to Cloud Run and wrote a README with setup steps.',
  targetRole: 'Backend Engineer',
});
if (!cv.bullet) throw new Error('CV bullet contract failed');

console.log('Live Gemini roadmap and CV bullet checks passed.');
