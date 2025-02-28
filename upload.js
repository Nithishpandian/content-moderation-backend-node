const { storage } = require("./config/gcloudConfig");
const multer = require("multer");
const path = require("path");

const bucketName = process.env.GCLOUD_BUCKETNAME;
const bucket = storage.bucket(bucketName);

const upload = multer({
  storage: multer.memoryStorage(),
});

// Upload video to Google Cloud Storage
const uploadToGCS = (file) => {
  return new Promise((resolve, reject) => {
    if (!file) {
      return reject("No file provided");
    }

    const blob = bucket.file(file.originalname);
    const blobStream = blob.createWriteStream({
      resumable: false,
    });

    blobStream.on("finish", () => {
      resolve(`gs://${bucketName}/${file.originalname}`);
    });

    blobStream.on("error", (err) => {
      reject(err);
    });

    blobStream.end(file.buffer);
  });
};

module.exports = { upload, uploadToGCS };
