import express from "express";

/** Video/audio players need byte ranges for seeking and metadata reads; ordinary assets keep full responses. */
export function mediaStatic(root: string): express.RequestHandler {
  const media = express.static(root, { acceptRanges: true });
  const ordinary = express.static(root, { acceptRanges: false });
  return (req, res, next) => {
    if (!/\.(mp4|webm|mp3|wav)$/i.test(req.path)) return ordinary(req, res, next);
    // Browsers request a single range. Reject multipart range amplification.
    if (req.headers.range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(req.headers.range)) return res.status(416).end();
    return media(req, res, next);
  };
}
