import { describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({
  getJson: vi.fn(),
  postJson: vi.fn().mockResolvedValue({ tasks: [{ id: 'task-1', title: 'Build 1 backtest report', weight: 100, status: 'not_started' }] }),
}));

import { postJson } from './api';
import { generateTargetRole } from './roadmap';

describe('role roadmap', () => {
  it('sends the selected role ID to the backend and creates a local target', async () => {
    const result = await generateTargetRole({ id: 'quant', title: 'Quant / Trading' }, 'Python and probability');
    expect(postJson).toHaveBeenCalledWith('/api/roadmap', {
      experience: 'Python and probability',
      targetRole: { id: 'quant', title: 'Quant / Trading' },
    });
    expect(result).toMatchObject({ id: 'quant', title: 'Quant / Trading', tasks: [{ id: 'task-1' }] });
  });
});
