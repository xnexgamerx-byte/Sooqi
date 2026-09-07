import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { api, ApiError } from "./api";

/**
 * رفع صور الإعلانات.
 *
 * التصغير يحدث على الجهاز قبل الرفع. صورة من كاميرا حديثة تقارب ٥ ميغابايت،
 * وبعد التصغير إلى ١٦٠٠ بكسل تصير نحو ٣٠٠ كيلوبايت. على بيانات الجوال في
 * العراق هذا الفرق بين رفع ينجح ورفع يُهجر في منتصفه.
 *
 * الرفع يذهب مباشرة إلى R2 برابط موقّع؛ الصورة لا تمرّ عبر خادمنا.
 */

/** أطول ضلع للصورة الكاملة. أكبر من هذا لا يضيف شيئاً على شاشة هاتف. */
const FULL_MAX = 1600;

/** أطول ضلع للمصغّرة التي تعرضها الشبكة الثلاثية. */
const THUMB_MAX = 400;

const FULL_QUALITY = 0.82;
const THUMB_QUALITY = 0.7;

export type PreparedImage = {
  /** مسار محلي للعرض في النموذج قبل الرفع. */
  previewUri: string;
  fullUri: string;
  thumbUri: string;
  width: number;
  height: number;
};

export type UploadedImage = {
  storageKey: string;
  thumbKey: string;
  width: number;
  height: number;
};

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

/** يفتح معرض الصور ويعيد ما اختاره المستخدم، مصغّراً وجاهزاً للرفع. */
export async function pickImages(limit: number): Promise<PreparedImage[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new UploadError(
      "نحتاج إذن الوصول للصور. فعّله من إعدادات الهاتف ثم حاول مرة ثانية.",
    );
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    quality: 1,
  });

  if (result.canceled) return [];

  return Promise.all(result.assets.map((asset) => prepare(asset.uri)));
}

/** يفتح الكاميرا ويعيد صورة واحدة جاهزة للرفع. */
export async function captureImage(): Promise<PreparedImage | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new UploadError(
      "نحتاج إذن الكاميرا. فعّله من إعدادات الهاتف ثم حاول مرة ثانية.",
    );
  }

  const result = await ImagePicker.launchCameraAsync({ quality: 1 });
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) return null;

  return prepare(asset.uri);
}

/** يولّد النسختين: الكاملة والمصغّرة. */
async function prepare(uri: string): Promise<PreparedImage> {
  const full = await resize(uri, FULL_MAX, FULL_QUALITY);
  const thumb = await resize(uri, THUMB_MAX, THUMB_QUALITY);

  return {
    previewUri: thumb.uri,
    fullUri: full.uri,
    thumbUri: thumb.uri,
    width: full.width,
    height: full.height,
  };
}

async function resize(uri: string, maxSide: number, quality: number) {
  const context = ImageManipulator.manipulate(uri);
  // نمرّر width فقط؛ المكتبة تحافظ على النسبة، فالصور الطولية لا تُشوَّه
  context.resize({ width: maxSide });

  const image = await context.renderAsync();
  const saved = await image.saveAsync({
    format: SaveFormat.JPEG,
    compress: quality,
  });

  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/**
 * يرفع صورة واحدة: يطلب رابطين موقّعين، ثم يرفع الملفين إلى R2.
 *
 * الفشل في المصغّرة وحدها لا يُسقط العملية — الخادم يعرض الأصل حين تكون
 * `thumbKey` فارغة، فصورة أثقل أفضل من إعلان بلا صورة.
 */
export async function uploadImage(
  image: PreparedImage,
): Promise<UploadedImage> {
  const fullBlob = await readAsBlob(image.fullUri);

  const signed = await api.signUpload({
    contentType: "image/jpeg",
    sizeBytes: fullBlob.size,
  });

  await put(signed.full.uploadUrl, fullBlob);

  let thumbKey = signed.thumb.key;
  try {
    const thumbBlob = await readAsBlob(image.thumbUri);
    await put(signed.thumb.uploadUrl, thumbBlob);
  } catch {
    thumbKey = "";
  }

  return {
    storageKey: signed.full.key,
    thumbKey,
    width: image.width,
    height: image.height,
  };
}

async function readAsBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new UploadError("تعذّرت قراءة الصورة من الجهاز");
  }
  return response.blob();
}

async function put(url: string, body: Blob) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "PUT",
      body,
      headers: { "Content-Type": "image/jpeg" },
    });
  } catch {
    throw new UploadError("انقطع الاتصال أثناء رفع الصورة");
  }

  if (!response.ok) {
    throw new UploadError(`فشل رفع الصورة (${response.status})`);
  }
}

/** يرفع عدة صور بالتتابع ويبلّغ عن التقدّم. */
export async function uploadAll(
  images: PreparedImage[],
  onProgress?: (done: number, total: number) => void,
): Promise<UploadedImage[]> {
  const uploaded: UploadedImage[] = [];

  for (const [index, image] of images.entries()) {
    try {
      uploaded.push(await uploadImage(image));
    } catch (error) {
      if (error instanceof ApiError || error instanceof UploadError) throw error;
      throw new UploadError("تعذّر رفع الصور. تحقق من الإنترنت.");
    }
    onProgress?.(index + 1, images.length);
  }

  return uploaded;
}
