// S3 Image URLs Configuration
// Using the actual S3 bucket: images-retrotaxi.s3.eu-north-1.amazonaws.com

const S3_BASE_URL = "https://images-retrotaxi.s3.eu-north-1.amazonaws.com";

export const IMAGES = {
    // Logo
    LOGO: `${S3_BASE_URL}/RT-logo.png`,

    // Home page background
    HOME_BACKGROUND: `${S3_BASE_URL}/voiture-en-montagne.jpg`,

    // Brand images for blogs
    BRANDS: {
        Tesla: `${S3_BASE_URL}/Tesla.jpg`,
        Amazon: `${S3_BASE_URL}/zoox.jpg`,
        Google: `${S3_BASE_URL}/Waymo.jpg`,
        GM: `${S3_BASE_URL}/Cruise.jpg`,
        Baidu: `${S3_BASE_URL}/baidu.jpg`,
    },

    // Provider logos (used on maps and elsewhere)
    PROVIDER_LOGOS: {
        Waymo: `${S3_BASE_URL}/logos/waymo.svg`,
        Tesla: `${S3_BASE_URL}/logos/tesla.svg`,
        Baidu: `${S3_BASE_URL}/logos/baidu.svg`,
        Cruise: `${S3_BASE_URL}/logos/cruise.svg`,
        Ponyai: `${S3_BASE_URL}/logos/ponyai.svg`,
        WeRide: `${S3_BASE_URL}/logos/weride.svg`,
        Zoox: `${S3_BASE_URL}/logos/zoox.svg`,
        Lyft: `${S3_BASE_URL}/logos/lyft.svg`,
        Uber: `${S3_BASE_URL}/logos/uber.svg`,
        Lucid: `${S3_BASE_URL}/logos/lucid.svg`,
        May: `${S3_BASE_URL}/logos/may.svg`,
    },
};

export default IMAGES;
