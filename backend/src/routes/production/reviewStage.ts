import express from 'express';
import { z } from 'zod';
import u from '@/utils';
import { validateFields } from '@/middleware/middleware';
import { success, error } from '@/lib/responseFormat';
import { approveDirectorStage } from '@/utils/directorStageReview';

const router = express.Router();
export default router.post('/', validateFields({ projectId: z.number(), scriptId: z.number(), stage: z.enum(['scriptPlan', 'storyboardTable']), content: z.string(), scriptPlan: z.string(), script: z.string() }), async (req, res) => {
  const result = await approveDirectorStage(u.db, Number((req as any).user.id), req.body);
  if (result.message) return res.status(409).send(error(result.message));
  return res.json(success(result.state));
});
