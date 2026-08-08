const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Uploads a base64 data URI (or remote URL) to Cloudinary.
 * Replaces the old local-disk fs.writeFileSync approach, which lost files
 * on every Render restart/redeploy since the filesystem there is ephemeral.
 *
 * @param {string} base64String - data:<mime>;base64,<data> string
 * @param {string} folder - Cloudinary folder, e.g. 'synergy/posts' or 'synergy/avatars'
 * @param {string} publicIdPrefix - prefix used to build a readable public_id
 * @returns {Promise<string|null>} the secure HTTPS URL of the uploaded asset, or null on failure
 */
const uploadBase64ToCloudinary = async (base64String, folder, publicIdPrefix) => {
  try {
    if (!base64String) return null;

    const isVideo = base64String.includes('data:video');

    const result = await cloudinary.uploader.upload(base64String, {
      folder,
      public_id: `${publicIdPrefix}_${Date.now()}`,
      resource_type: isVideo ? 'video' : 'image',
      overwrite: true,
    });

    console.log(`✅ Uploaded to Cloudinary: ${result.public_id} (${result.bytes} bytes)`);
    return result.secure_url;
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error.message);
    return null;
  }
};

module.exports = { cloudinary, uploadBase64ToCloudinary };
