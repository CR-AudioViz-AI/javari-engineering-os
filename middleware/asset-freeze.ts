/**
 * Asset Freeze Middleware - STEP 1 OF 6
 * 
 * Blocks ALL asset upload endpoints during migration
 * Generated: Friday, January 30, 2026 - 11:55 PM EST
 */

export class AssetFreezeError extends Error {
  constructor() {
    super('ASSET FREEZE IN EFFECT — STEP 1 OF 6');
    this.name = 'AssetFreezeError';
  }
}

export function checkAssetFreeze(): void {
  const ASSET_FREEZE = process.env.ASSET_FREEZE === 'true' || 
                       process.env.NEXT_PUBLIC_ASSET_FREEZE === 'true';
  
  if (ASSET_FREEZE) {
    throw new AssetFreezeError();
  }
}

export function assetFreezeMiddleware(req: any, res: any, next: any) {
  // Check if asset freeze is active
  if (process.env.ASSET_FREEZE === 'true') {
    return res.status(503).json({
      error: 'Asset Freeze Active',
      message: 'ASSET FREEZE IN EFFECT — STEP 1 OF 6',
      details: 'All asset uploads are temporarily disabled during organization-wide migration.',
      instructions: [
        'Asset uploads will resume after migration completes',
        'Current status: Step 1 of 6 - Repository freeze',
        'Contact: platform@craudiovizai.com for assistance'
      ],
      resumesAt: 'After migration verification (approximately 2-3 hours)',
      useInstead: 'R2 Ingestion Pipeline (scripts/activate-r2-ingestion.ts)'
    });
  }
  
  next();
}

// Export for use in API routes
export const ASSET_FREEZE_ACTIVE = process.env.ASSET_FREEZE === 'true';

// Disabled upload endpoints during freeze
export const DISABLED_ENDPOINTS = [
  '/api/upload',
  '/api/uploads',
  '/api/assets/upload',
  '/api/images/upload',
  '/api/files/upload',
  '/upload',
  '/uploads',
];

export function isUploadEndpoint(path: string): boolean {
  return DISABLED_ENDPOINTS.some(endpoint => 
    path.includes(endpoint) || 
    path.endsWith('/upload') ||
    path.includes('/upload/')
  );
}

export default assetFreezeMiddleware;
