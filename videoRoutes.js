const express = require("express");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const { client } = require("./config/gcloudConfig");
const { upload, uploadToGCS } = require("./upload");

const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
ffmpeg.setFfmpegPath(ffmpegPath);

const router = express.Router();

async function blurInappropriateContent(inputPath, timestamps) {
  return new Promise((resolve, reject) => {
    const tempOutputPath = path.join(__dirname, "temp_blurred.mp4");

    if (timestamps.length === 0) {
      resolve(inputPath); // No blur needed, return original
      return;
    }

    // Convert timestamps to numbers (from Long objects)
    timestamps = timestamps.map((ts) => ts.low || 0);

    // Apply blur only at specified timestamps
    let blurFilters = timestamps
      .map((startTime) => {
        const duration = 3; // Apply blur for 3 seconds
        return `boxblur=10:enable='between(t,${startTime},${
          startTime + duration
        })'`;
      })
      .join(",");

    ffmpeg(inputPath)
      .videoFilter(blurFilters)
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

router.post("/analyze", upload.single("video"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No video file uploaded" });
  }

  try {
    const inputUri = await uploadToGCS(req.file);
    console.log("Analyzing video at:", inputUri);

    // Request Video Intelligence API with multiple features
    const [operation] = await client.annotateVideo({
      inputUri: inputUri,
      features: [
        "EXPLICIT_CONTENT_DETECTION",
        "LABEL_DETECTION",
        "OBJECT_TRACKING",
        "SHOT_CHANGE_DETECTION",
      ],
    });

    const [result] = await operation.promise();
    const annotationResults = result.annotationResults[0];

    // Extract timestamps for explicit content
    let blurTimestamps = annotationResults.explicitAnnotation.frames
      .filter((frame) => frame.pornographyLikelihood >= 2) // Adjust sensitivity
      .map((frame) => frame.timeOffset.seconds || 0);

    // Extract timestamps for violent/blood-related objects
    const sensitiveLabels = ["Violence", "Blood", "Weapon", "Hate Symbol"];

    annotationResults.segmentLabelAnnotations?.forEach((label) => {
      if (sensitiveLabels.includes(label.entity.description)) {
        label.segments.forEach((segment) => {
          blurTimestamps.push(segment.segment.startTimeOffset.seconds || 0);
        });
      }
    });

    annotationResults.objectAnnotations?.forEach((object) => {
      if (sensitiveLabels.includes(object.entity.description)) {
        blurTimestamps.push(object.segment.startTimeOffset.seconds || 0);
      }
    });

    // Remove duplicate timestamps and sort
    blurTimestamps = [...new Set(blurTimestamps)].sort((a, b) => a - b);

    console.log("Blur timestamps:", blurTimestamps);

    if (blurTimestamps.length === 0) {
      return res.json({ message: "No explicit or violent content detected." });
    }

    // Save uploaded file temporarily
    const tempInputPath = path.join(__dirname, "temp_input.mp4");
    fs.writeFileSync(tempInputPath, req.file.buffer);

    // Process video to blur detected content

    const blurredVideoPath = await blurInappropriateContent(
      tempInputPath,
      blurTimestamps
    );

    // Send the processed video as response
    res.download(blurredVideoPath, "blurred-video.mp4", () => {
      fs.unlinkSync(tempInputPath); // Cleanup
      fs.unlinkSync(blurredVideoPath);
    });
  } catch (error) {
    console.error("Error in video analysis:", error);
    res.status(500).json({ error: "Error processing video." });
  }
});

// router.post("/analyze", upload.single("video"), async (req, res) => {
//   if (!req.file) {
//     return res.status(400).json({ error: "No video file uploaded" });
//   }

//   try {
//     const inputUri = await uploadToGCS(req.file);
//     console.log("Analyzing video at:", inputUri);

//     const [operation] = await client.annotateVideo({
//       inputUri: inputUri,
//       features: ["EXPLICIT_CONTENT_DETECTION"],
//     });

//     const [result] = await operation.promise();
//     const explicitContentResults =
//       result.annotationResults[0].explicitAnnotation.frames;

//     let blurTimestamps = explicitContentResults
//       .filter((frame) => frame.pornographyLikelihood >= 2) // Adjust sensitivity
//       .map((frame) => frame.timeOffset.seconds || 0);

//     console.log("Blur timestamps:", blurTimestamps);

//     if (blurTimestamps.length === 0) {
//       return res.json({ message: "No explicit content detected." });
//     }

//     // Save uploaded file temporarily
//     const tempInputPath = path.join(__dirname, "temp_input.mp4");
//     fs.writeFileSync(tempInputPath, req.file.buffer);

//     // Process video to blur explicit content
//     const blurredVideoPath = await blurInappropriateContent(
//       tempInputPath,
//       blurTimestamps
//     );

//     // Send the processed video as response
//     res.download(blurredVideoPath, "blurred-video.mp4", () => {
//       fs.unlinkSync(tempInputPath); // Cleanup
//       fs.unlinkSync(blurredVideoPath);
//     });
//   } catch (error) {
//     console.error("Error in video analysis:", error);
//     res.status(500).json({ error: "Error processing video." });
//   }
// });

module.exports = router;
