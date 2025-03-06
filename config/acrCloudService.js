const ACRCloud = require("acrcloud");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");

// Initialize ACRCloud
const acr = new ACRCloud({
  host: "https://identify-ap-southeast-1.acrcloud.com/v1/identify",
  access_key: process.env.ACR_access_key,
  access_secret: process.env.ACR_access_secret,
});

// Function to extract audio from video
async function extractAudioFromVideo(videoPath) {
  return new Promise((resolve, reject) => {
    const audioPath = path.join(__dirname, "temp_audio.mp3");

    ffmpeg(videoPath)
      .output(audioPath)
      .noVideo()
      .audioCodec("libmp3lame")
      .on("end", () => resolve(audioPath))
      .on("error", (err) => reject(err))
      .run();
  });
}

// Function to analyze audio for copyrighted content
async function identifyAudio(audioPath) {
  const audioBuffer = fs.readFileSync(audioPath);

  return new Promise((resolve, reject) => {
    acr.identify(audioBuffer, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

// const axios = require("axios");
// const FormData = require("form-data");

// async function identifyAudio(audioPath) {
//   const audioBuffer = fs.readFileSync(audioPath);

//   let formData = new FormData();
//   formData.append("sample", audioBuffer, { filename: "audio.mp3" });

//   const headers = {
//     ...formData.getHeaders(),
//     Authorization: `Bearer ${process.env.ACR_access_key}`,
//   };

//   try {
//     const response = await axios.post(process.env.ACR_host, formData, {
//       headers,
//     });
//     return response.data;
//   } catch (error) {
//     console.error("ACRCloud API Error:", error.message);
//     throw new Error("ACRCloud request failed");
//   }
// }

module.exports = { extractAudioFromVideo, identifyAudio };
