import express from 'express';
import { z } from 'zod';
import { validateFields } from '@/middleware/middleware';
import { submitDirectorVideos } from '@/utils/directorVideoGeneration';
const router=express.Router();
const trackSchema=z.object({
  trackId:z.number().int().positive(),
  prompt:z.string().max(30000),
  duration:z.number().positive().max(120),
  uploadData:z.array(z.object({id:z.number().int().positive(),sources:z.enum(['assets','storyboard'])})).max(32),
});
export default router.post('/',validateFields({
  projectId:z.number().int().positive(),scriptId:z.number().int().positive(),
  model:z.string(),mode:z.string(),resolution:z.string(),audio:z.boolean().optional(),
  ...trackSchema.shape,
}),async(req,res)=>{
  await submitDirectorVideos(Number((req as any).user?.id),{...req.body,trackData:[req.body]},res,true);
});
