const {
  VideoIntelligenceServiceClient,
} = require("@google-cloud/video-intelligence");
const { Storage } = require("@google-cloud/storage");

const client = new VideoIntelligenceServiceClient({
  keyFilename:
    "D:/files/content-moderation-techgium/server/content-moderation-451906-ec9b501ec0c4.json",
});

const storage = new Storage({
  keyFilename:
    "D:/files/content-moderation-techgium/server/content-moderation-451906-ec9b501ec0c4.json",
});

module.exports = { client, storage };
