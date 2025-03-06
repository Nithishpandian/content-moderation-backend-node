// const express = require("express");
// const fs = require("fs");
// const path = require("path");
// const ffmpeg = require("fluent-ffmpeg");
// const { client } = require("./config/gcloudConfig");
// const { upload, uploadToGCS } = require("./upload");
// const {
//   extractAudioFromVideo,
//   identifyAudio,
// } = require("./config/acrCloudService");

// const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
// ffmpeg.setFfmpegPath(ffmpegPath);

// const router = express.Router();

// async function blurInappropriateContent(inputPath, timestamps) {
//   return new Promise((resolve, reject) => {
//     const tempOutputPath = path.join(__dirname, "temp_blurred.mp4");

//     if (timestamps.length === 0) {
//       resolve(inputPath); // No blur needed, return original
//       return;
//     }

//     // Convert timestamps to numbers (from Long objects)
//     timestamps = timestamps.map((ts) => ts.low || 0);

//     // Apply blur only at specified timestamps
//     let blurFilters = timestamps
//       .map((startTime) => {
//         const duration = 3; // Apply blur for 3 seconds
//         return `boxblur=10:enable='between(t,${startTime},${
//           startTime + duration
//         })'`;
//       })
//       .join(",");

//     ffmpeg(inputPath)
//       .videoFilter(blurFilters)
//       .output(tempOutputPath)
//       .on("end", () => {
//         resolve(tempOutputPath);
//       })
//       .on("error", (err) => reject(err))
//       .run();
//   });
// }

// router.post("/analyze", upload.single("video"), async (req, res) => {
//   if (!req.file) {
//     return res.status(400).json({ error: "No video file uploaded" });
//   }

//   try {
//     const inputUri = await uploadToGCS(req.file);
//     console.log("Analyzing video at:", inputUri);

//     // Request Video Intelligence API with multiple features
//     const [operation] = await client.annotateVideo({
//       inputUri: inputUri,
//       features: [
//         "EXPLICIT_CONTENT_DETECTION",
//         // "LABEL_DETECTION",
//         // "OBJECT_TRACKING",
//         // "SHOT_CHANGE_DETECTION",
//       ],
//     });

//     const [result] = await operation.promise();
//     const annotationResults = result.annotationResults[0];

//     // Extract timestamps for explicit content
//     let blurTimestamps = annotationResults.explicitAnnotation.frames
//       .filter((frame) => frame.pornographyLikelihood >= 2) // Adjust sensitivity
//       .map((frame) => frame.timeOffset.seconds || 0);

//     // Extract timestamps for violent/blood-related objects
//     const sensitiveLabels = ["Violence", "Blood", "Weapon", "Hate Symbol"];

//     // Collect timestamps for sensitive labels
//     annotationResults.segmentLabelAnnotations?.forEach((label) => {
//       if (sensitiveLabels.includes(label.entity.description)) {
//         label.segments.forEach((segment) => {
//           blurTimestamps.push(segment.segment.startTimeOffset.seconds || 0);
//         });
//       }
//     });

//     annotationResults.objectAnnotations?.forEach((object) => {
//       if (sensitiveLabels.includes(object.entity.description)) {
//         blurTimestamps.push(object.segment.startTimeOffset.seconds || 0);
//       }
//     });

//     // Remove duplicate timestamps and sort
//     blurTimestamps = [...new Set(blurTimestamps)].sort((a, b) => a - b);

//     console.log("Blur timestamps:", blurTimestamps);

//     if (blurTimestamps.length === 0) {
//       return res.json({ message: "No explicit or violent content detected." });
//     }

//     // Save uploaded file temporarily
//     const tempInputPath = path.join(__dirname, "temp_input.mp4");
//     fs.writeFileSync(tempInputPath, req.file.buffer);

//     // Process video to blur detected content
//     const blurredVideoPath = await blurInappropriateContent(
//       tempInputPath,
//       blurTimestamps
//     );

//     // Send the processed video as response
//     res.download(blurredVideoPath, "blurred-video.mp4", () => {
//       // Cleanup temporary files
//       try {
//         fs.unlinkSync(tempInputPath);
//         fs.unlinkSync(blurredVideoPath);
//       } catch (err) {
//         console.error("Error during cleanup:", err);
//       }
//     });
//   } catch (error) {
//     console.error("Error in video analysis:", error);
//     res.status(500).json({ error: "Error processing video." });
//   }
// });

// router.post("/detect-copyright", upload.single("video"), async (req, res) => {
//   if (!req.file) {
//     return res.status(400).json({ error: "No video file uploaded" });
//   }

//   try {
//     const tempVideoPath = path.join(__dirname, "temp_video.mp4");
//     // fs.writeFileSync(tempVideoPath, req.file.buffer); // Save video file
//     await fs.promises.writeFile(tempVideoPath, req.file.buffer);

//     // Extract audio and detect copyright
//     const audioPath = await extractAudioFromVideo(tempVideoPath);
//     const result = await identifyAudio(audioPath);

//     console.log(result);

//     if (result.status.code === 0 && result.metadata.music) {
//       return res.json({
//         message: "Copyrighted content detected!",
//         tracks: result.metadata.music.map((track) => ({
//           title: track.title,
//           artist: track.artists.map((a) => a.name).join(", "),
//           album: track.album.name,
//           release_date: track.release_date,
//         })),
//       });
//     } else {
//       return res.json({ message: "No copyrighted content detected." });
//     }
//   } catch (error) {
//     console.error("Error in copyright detection:", error);
//     res.status(500).json({ error: "Error processing video." });
//   }
// });

const express = require("express");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const { client } = require("./config/gcloudConfig");
const { upload, uploadToGCS } = require("./upload");
const {
  extractAudioFromVideo,
  identifyAudio,
} = require("./config/acrCloudService");
const { spawn } = require("child_process");
const os = require("os");

const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
ffmpeg.setFfmpegPath(ffmpegPath);

const router = express.Router();

// Cache for processed videos to avoid reprocessing the same content
const processedVideosCache = new Map();

// Function to generate a hash for a video buffer
function generateVideoHash(buffer) {
  const crypto = require("crypto");
  return crypto.createHash("md5").update(buffer).digest("hex");
}

async function blurInappropriateContent(inputPath, timestamps) {
  return new Promise((resolve, reject) => {
    const tempOutputPath = path.join(__dirname, "temp_blurred.mp4");

    if (timestamps.length === 0) {
      resolve(inputPath); // No blur needed, return original
      return;
    }

    // Convert timestamps to numbers (from Long objects)
    timestamps = timestamps.map((ts) => ts.low || 0);

    // Optimize by combining overlapping blur periods
    const combinedTimestamps = [];
    let currentStart = timestamps[0];
    let currentEnd = currentStart + 3;

    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] <= currentEnd) {
        // Timestamps overlap, extend the current period
        currentEnd = timestamps[i] + 3;
      } else {
        // No overlap, add the current period and start a new one
        combinedTimestamps.push([currentStart, currentEnd]);
        currentStart = timestamps[i];
        currentEnd = currentStart + 3;
      }
    }
    combinedTimestamps.push([currentStart, currentEnd]);

    // Create a more subtle blur with reduced strength
    let blurFilters = combinedTimestamps
      .map(([startTime, endTime]) => {
        // Reduced blur strength (15) with fewer iterations (2)
        return `boxblur=15:2:enable='between(t,${startTime},${endTime})'`;
      })
      .join(",");

    // Performance optimizations
    ffmpeg(inputPath)
      .videoFilters(blurFilters)
      .outputOptions([
        '-c:v libx264',         // Use H.264 codec
        '-preset ultrafast',    // Fastest encoding preset (prioritize speed over file size)
        '-crf 28',              // Lower quality for faster processing (higher number = lower quality)
        '-movflags +faststart', // Optimize for web playback
        '-c:a copy',            // Copy audio stream without re-encoding
        '-threads 0'            // Use all available CPU threads
      ])
      .output(tempOutputPath)
      .on("end", () => {
        resolve(tempOutputPath);
      })
      .on("error", (err) => reject(err))
      .run();
  });
}

// async function blurInappropriateContent(inputPath, timestamps) {
//   return new Promise((resolve, reject) => {
//     const tempOutputPath = path.join(__dirname, "temp_blurred.mp4");

//     if (timestamps.length === 0) {
//       resolve(inputPath); // No blur needed, return original
//       return;
//     }

//     // Convert timestamps to numbers (from Long objects)
//     timestamps = timestamps.map((ts) => ts.low || 0);

//     // Optimize by combining overlapping blur periods
//     const combinedTimestamps = [];
//     let currentStart = timestamps[0];
//     let currentEnd = currentStart + 3;

//     for (let i = 1; i < timestamps.length; i++) {
//       if (timestamps[i] <= currentEnd) {
//         // Timestamps overlap, extend the current period
//         currentEnd = timestamps[i] + 3;
//       } else {
//         // No overlap, add the current period and start a new one
//         combinedTimestamps.push([currentStart, currentEnd]);
//         currentStart = timestamps[i];
//         currentEnd = currentStart + 3;
//       }
//     }
//     combinedTimestamps.push([currentStart, currentEnd]);

//     // Create proper blur filters with combined timestamps
//     // Use a stronger blur effect that will effectively obscure the content
//     let blurFilters = combinedTimestamps
//       .map(([startTime, endTime]) => {
//         // Use a proper boxblur with higher strength (30) and more iterations (5)
//         return `boxblur=30:5:enable='between(t,${startTime},${endTime})'`;
//       })
//       .join(",");

//     // Use more efficient ffmpeg command
//     ffmpeg(inputPath)
//       .videoFilters(blurFilters) // Using videoFilters instead of videoFilter
//       .outputOptions([
//         "-c:v libx264", // Use H.264 codec
//         "-preset fast", // Faster encoding
//         "-tune fastdecode", // Optimize for faster decoding
//         "-movflags +faststart", // Optimize for web playback
//         "-c:a copy", // Copy audio stream without re-encoding
//       ])
//       .output(tempOutputPath)
//       .on("end", () => {
//         resolve(tempOutputPath);
//       })
//       .on("error", (err) => reject(err))
//       .run();
//   });
// }

router.post("/analyze", upload.single("video"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No video file uploaded" });
  }

  try {
    // Generate hash of the video buffer for caching
    const videoHash = generateVideoHash(req.file.buffer);

    // Check if we've already processed this exact video
    if (processedVideosCache.has(videoHash)) {
      const cachedVideoPath = processedVideosCache.get(videoHash);
      return res.download(cachedVideoPath, "blurred-video.mp4");
    }

    // Save uploaded file temporarily using promises for better performance
    const tempInputPath = path.join(__dirname, `temp_input_${videoHash}.mp4`);
    await fs.promises.writeFile(tempInputPath, req.file.buffer);

    // Parallel processing - start uploading to GCS while also preparing for local processing
    const uploadPromise = uploadToGCS(req.file);

    // Only analyze the first minute as per your requirement
    // Extract video duration using ffprobe
    const duration = await getVideoDuration(tempInputPath);
    const analyzeDuration = Math.min(duration, 60); // Limit to 60 seconds

    // Process in parallel when possible
    const inputUri = await uploadPromise;
    console.log("Analyzing video at:", inputUri);

    // Request Video Intelligence API with only necessary features
    // Limit the analysis to the first minute
    const [operation] = await client.annotateVideo({
      inputUri: inputUri,
      features: ["EXPLICIT_CONTENT_DETECTION"],
      videoContext: {
        segments: [
          {
            startTimeOffset: { seconds: 0, nanos: 0 },
            endTimeOffset: { seconds: analyzeDuration, nanos: 0 },
          },
        ],
      },
    });

    const [result] = await operation.promise();
    const annotationResults = result.annotationResults[0];

    // Extract timestamps for explicit content
    let blurTimestamps = annotationResults.explicitAnnotation.frames
      .filter((frame) => frame.pornographyLikelihood >= 2) // Adjust sensitivity
      .map((frame) => frame.timeOffset.seconds || 0);

    // Remove duplicate timestamps and sort
    blurTimestamps = [...new Set(blurTimestamps)].sort((a, b) => a - b);

    console.log("Blur timestamps:", blurTimestamps);

    if (blurTimestamps.length === 0) {
      // Cleanup temp file
      fs.promises.unlink(tempInputPath).catch(console.error);
      return res.json({ message: "No explicit or violent content detected." });
    }

    // Process video to blur detected content
    const blurredVideoPath = await blurInappropriateContent(
      tempInputPath,
      blurTimestamps
    );

    // Cache the processed video result
    processedVideosCache.set(videoHash, blurredVideoPath);

    // Implement cache size management (limit to 10 videos)
    if (processedVideosCache.size > 10) {
      const oldestKey = processedVideosCache.keys().next().value;
      const oldPath = processedVideosCache.get(oldestKey);
      fs.promises.unlink(oldPath).catch(console.error);
      processedVideosCache.delete(oldestKey);
    }

    // Send the processed video as response
    res.download(blurredVideoPath, "blurred-video.mp4", () => {
      // Keep the processed file for caching, but remove the input temp file
      fs.promises.unlink(tempInputPath).catch(console.error);
    });
  } catch (error) {
    console.error("Error in video analysis:", error);
    res.status(500).json({ error: "Error processing video." });
  }
});

// Helper function to get video duration
function getVideoDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration);
    });
  });
}

// Optimized copyright detection route
// router.post("/detect-copyright", upload.single("video"), async (req, res) => {
//   if (!req.file) {
//     return res.status(400).json({ error: "No video file uploaded" });
//   }

//   try {
//     const videoHash = generateVideoHash(req.file.buffer);
//     const tempVideoPath = path.join(__dirname, `temp_video_${videoHash}.mp4`);
//     await fs.promises.writeFile(tempVideoPath, req.file.buffer);

//     // Extract audio and detect copyright
//     const audioPath = await extractAudioFromVideo(tempVideoPath);
//     const result = await identifyAudio(audioPath);

//     // Clean up temp files immediately
//     fs.promises.unlink(tempVideoPath).catch(console.error);
//     fs.promises.unlink(audioPath).catch(console.error);

//     if (result.status.code === 0 && result.metadata.music) {
//       return res.json({
//         message: "Copyrighted content detected!",
//         tracks: result.metadata.music.map((track) => ({
//           title: track.title,
//           artist: track.artists.map((a) => a.name).join(", "),
//           album: track.album.name,
//           release_date: track.release_date,
//         })),
//       });
//     } else {
//       return res.json({ message: "No copyrighted content detected." });
//     }
//   } catch (error) {
//     console.error("Error in copyright detection:", error);
//     res.status(500).json({ error: "Error processing video." });
//   }
// });

module.exports = router;
