// const {
//   S3Client,
//   PutObjectCommand,
//   GetObjectCommand,
// } = require("@aws-sdk/client-s3");
// const {
//   RekognitionClient,
//   StartContentModerationCommand,
//   GetContentModerationCommand,
// } = require("@aws-sdk/client-rekognition");
// const {
//   MediaConvertClient,
//   CreateJobCommand,
//   DescribeEndpointsCommand,
// } = require("@aws-sdk/client-mediaconvert");
// const multerS3 = require("multer-s3");
// const multer = require("multer");
// const { exec } = require("child_process");
// const path = require("path");
// const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
// const fs = require("fs");

const express = require("express");
const cors = require("cors");

const app = express();
require("dotenv").config();
const videoRoutes = require('./videoRoutes');

app.use(express.json());
app.use(cors());

app.use('/videos', videoRoutes);

// Initialize AWS S3 Client (SDK v3)
// const s3Client = new S3Client({
//   region: process.env.AWS_REGION,
//   credentials: {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//   },
// });

// // Initialize AWS Rekognition Client (SDK v3)
// const rekognitionClient = new RekognitionClient({
//   region: process.env.AWS_REGION,
//   credentials: {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//   },
// });

// // Initialize MediaConvert Client
// // const mediaConvertClient = new MediaConvertClient({
// //   region: process.env.AWS_REGION,
// //   credentials: {
// //     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
// //     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
// //   },
// // });

// const mediaConvertClient = new MediaConvertClient({
//   region: process.env.AWS_REGION, // Ensure this matches your AWS setup
// });

// async function getMediaConvertEndpoint() {
//   try {
//     const tempClient = new MediaConvertClient({
//       region: process.env.AWS_REGION,
//       credentials: {
//         accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//         secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//       },
//     });

//     const command = new DescribeEndpointsCommand({});
//     const response = await tempClient.send(command);
//     console.log("MediaConvert Endpoint:", response.Endpoints[0].Url);
//     return response.Endpoints[0].Url;
//   } catch (error) {
//     console.error("Error getting MediaConvert endpoint:", error);
//     return null;
//   }
// }

// async function initializeMediaConvertClient() {
//   const endpoint = await getMediaConvertEndpoint();
//   if (endpoint) {
//     global.mediaConvertClient = new MediaConvertClient({
//       region: process.env.AWS_REGION,
//       endpoint, // Use the dynamically fetched endpoint
//       credentials: {
//         accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//         secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//       },
//     });
//     console.log("MediaConvert Client initialized successfully.");
//   } else {
//     console.error("Failed to initialize MediaConvert Client.");
//   }
// }

// // Call the function on server startup
// initializeMediaConvertClient();

// // Multer setup for file upload to S3
// const upload = multer({
//   storage: multerS3({
//     s3: s3Client,
//     bucket: process.env.AWS_BUCKET_NAME,
//     key: (req, file, cb) => {
//       cb(null, `videos/${Date.now()}_${file.originalname}`);
//     },
//   }),
// });

// app.post("/upload-video", upload.single("video"), async (req, res) => {
//   const videoKey = req.file.key;

//   const params = {
//     Video: {
//       S3Object: {
//         Bucket: process.env.AWS_BUCKET_NAME,
//         Name: videoKey,
//       },
//     },
//   };

//   try {
//     const command = new StartContentModerationCommand(params);
//     const response = await rekognitionClient.send(command);
//     res.status(200).send({ jobId: response.JobId });
//   } catch (error) {
//     console.error("Error starting moderation job:", error);
//     res.status(500).send("Failed to start moderation job.");
//   }
// });

// app.get("/moderation-results/:jobId", async (req, res) => {
//   const { jobId } = req.params;

//   const params = {
//     JobId: jobId,
//   };

//   try {
//     const command = new GetContentModerationCommand(params);
//     const response = await rekognitionClient.send(command);
//     res.status(200).send(response);
//   } catch (error) {
//     console.error("Error fetching moderation results:", error);
//     res.status(500).send("Failed to fetch moderation results.");
//   }
// });

// app.post("/generate-moderated-video", async (req, res) => {
//   const { videoKey, segments } = req.body;

//   try {
//     // Get video metadata to determine dimensions
//     const videoResponse = await s3Client.send(
//       new GetObjectCommand({
//         Bucket: process.env.AWS_BUCKET_NAME,
//         Key: videoKey,
//       })
//     );

//     // Assuming videoResponse.Metadata contains dimensions
//     const videoWidth = videoResponse.Metadata.width || 1920;
//     const videoHeight = videoResponse.Metadata.height || 1080;

//     if (!segments || segments.length === 0) {
//       return res
//         .status(400)
//         .json({ error: "No valid moderation segments found." });
//     }

//     // Sanitize the file name to avoid special characters
//     const sanitizedFileName =
//       path.parse(videoKey).name.replace(/[^a-zA-Z0-9._-]/g, "_") + ".mp4";
//     const moderatedVideoKey = `moderated/${sanitizedFileName}`;

//     // Filter valid segments (ensure bbox exists)
//     const validSegments = segments.filter(({ bbox }) => bbox);

//     // Create MediaConvert job with proper blur parameters
//     const jobParams = {
//       Role: process.env.AWS_MEDIACONVERT_ROLE,
//       Settings: {
//         Inputs: [
//           {
//             FileInput: `s3://${process.env.AWS_BUCKET_NAME}/${videoKey}`,
//           },
//         ],
//         OutputGroups: [
//           {
//             OutputGroupSettings: {
//               Type: "FILE_GROUP_SETTINGS",
//               FileGroupSettings: {
//                 Destination: `s3://${process.env.AWS_BUCKET_NAME}/moderated/`,
//               },
//             },
//             Outputs: [
//               {
//                 ContainerSettings: {
//                   Container: "MP4",
//                 },
//                 VideoDescription: {
//                   CodecSettings: {
//                     Codec: "H_264",
//                     H264Settings: { Bitrate: 5000000 },
//                   },
//                   ...(validSegments.length > 0 && {
//                     VideoPreprocessors: {
//                       ImageInserter: {
//                         InsertableImages: validSegments.map(({ bbox }) => ({
//                           Duration: 10000,
//                           ImageX: Math.floor(bbox.Left * videoWidth),
//                           ImageY: Math.floor(bbox.Top * videoHeight),
//                           Width: Math.floor(bbox.Width * videoWidth),
//                           Height: Math.floor(bbox.Height * videoHeight),
//                           ImageInserterInput: `s3://${process.env.AWS_BUCKET_NAME}/moderated/blur_image.jpeg`,
//                           // "s3://your-bucket/blur-overlay.png", // Make sure to provide the correct overlay image
//                           Layer: 1,
//                           Opacity: 100,
//                         })),
//                       },
//                     },
//                   }),
//                 },
//               },
//             ],
//           },
//         ],
//       },
//     };

//     const command = new CreateJobCommand(jobParams);
//     const mediaConvertResponse = await mediaConvertClient.send(command);

//     // Generate presigned URL for the moderated video
//     const getCommand = new GetObjectCommand({
//       Bucket: process.env.AWS_BUCKET_NAME,
//       Key: moderatedVideoKey,
//     });

//     const moderatedVideoUrl = await getSignedUrl(s3Client, getCommand, {
//       expiresIn: 3600, // 1 hour
//     });

//     res.status(200).json({ moderatedVideoUrl });
//   } catch (error) {
//     console.error("MediaConvert error:", error);
//     res.status(500).send("Failed to generate moderated video");
//   }
// });



app.listen(3001, () => console.log(`The server has started at port ${3001}`));
