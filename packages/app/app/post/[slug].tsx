import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, ApiError, getDevUserId } from "../../src/api";
import { ErrorState, Loading } from "../../src/components/StateView";
import { arNumber } from "../../src/format";
import { colors, radius, space } from "../../src/theme";
import {
  captureImage,
  pickImages,
  uploadAll,
  UploadError,
  type PreparedImage,
} from "../../src/upload";

/** يطابق MAX_IMAGES في الخادم و /uploads/limits. */
const MAX_PHOTOS = 12;

type Condition = "new" | "used" | "imported";

const CONDITIONS: { key: Condition; label: string }[] = [
  { key: "used", label: "مستعمل" },
  { key: "new", label: "جديد" },
  { key: "imported", label: "وارد" },
];

export default function PostFormScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [condition, setCondition] = useState<Condition>("used");
  const [citySlug, setCitySlug] = useState<string | null>(null);
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<PreparedImage[]>([]);
  const [uploaded, setUploaded] = useState(0);

  const fields = useQuery({
    queryKey: ["fields", slug],
    queryFn: () => api.categoryFields(slug),
    enabled: Boolean(slug),
  });

  const cities = useQuery({ queryKey: ["cities"], queryFn: api.cities });

  const submit = useMutation({
    mutationFn: async () => {
      // الصور أولاً: لو فشل الرفع لا نريد إعلاناً بلا صور في القاعدة
      setUploaded(0);
      const images = await uploadAll(photos, (done) => setUploaded(done));

      return api.createListing({
        categorySlug: slug,
        citySlug: citySlug ?? "",
        title: title.trim(),
        description: description.trim() || undefined,
        priceIqd: price ? Number(price.replace(/[^0-9]/g, "")) : null,
        condition,
        attributes,
        images: images.map((image) => ({
          storageKey: image.storageKey,
          thumbKey: image.thumbKey || undefined,
          width: image.width,
          height: image.height,
        })),
      });
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["listings"] });
      void queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      Alert.alert(
        "انحفظ الإعلان",
        `رقم إعلانك ${arNumber(created.refNo)}. صار مسودة — انشره من «إعلاناتي».`,
        [{ text: "تمام", onPress: () => router.dismissAll() }],
      );
    },
    onError: (error) => {
      Alert.alert(
        "تعذّر حفظ الإعلان",
        error instanceof ApiError || error instanceof UploadError
          ? error.message
          : "حاول مرة ثانية",
      );
    },
  });

  const addPhotos = async (source: "library" | "camera") => {
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return;

    try {
      if (source === "camera") {
        const shot = await captureImage();
        if (shot) setPhotos((previous) => [...previous, shot]);
        return;
      }
      const picked = await pickImages(room);
      if (picked.length > 0) {
        setPhotos((previous) => [...previous, ...picked].slice(0, MAX_PHOTOS));
      }
    } catch (error) {
      Alert.alert(
        "تعذّر إضافة الصورة",
        error instanceof UploadError ? error.message : "حاول مرة ثانية",
      );
    }
  };

  const problems = validate({
    title,
    citySlug,
    fields: fields.data,
    attributes,
    photoCount: photos.length,
  });
  const canSubmit = problems.length === 0 && !submit.isPending;

  if (fields.isPending || cities.isPending) {
    return (
      <SafeAreaView style={styles.screen}>
        <Loading />
      </SafeAreaView>
    );
  }

  if (fields.isError) {
    return (
      <SafeAreaView style={styles.screen}>
        <ErrorState
          message="تعذّر تحميل حقول القسم"
          onRetry={() => void fields.refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>تفاصيل الإعلان</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
        >
          <Field
            label="الصور"
            hint={`${arNumber(photos.length)} من ${arNumber(MAX_PHOTOS)}`}
          >
            <View style={styles.photos}>
              {photos.map((photo, index) => (
                <View key={photo.fullUri} style={styles.slotFilled}>
                  <Image
                    source={{ uri: photo.previewUri }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                  />
                  {index === 0 ? (
                    <View style={styles.coverTag}>
                      <Text style={styles.coverText}>الغلاف</Text>
                    </View>
                  ) : null}
                  <Pressable
                    style={styles.removePhoto}
                    hitSlop={8}
                    onPress={() =>
                      setPhotos((previous) =>
                        previous.filter((item) => item !== photo),
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`احذف الصورة ${arNumber(index + 1)}`}
                  >
                    <Ionicons name="close" size={13} color={colors.white} />
                  </Pressable>
                </View>
              ))}

              {photos.length < MAX_PHOTOS ? (
                <Pressable
                  style={styles.slot}
                  onPress={() => void addPhotos("library")}
                  accessibilityRole="button"
                  accessibilityLabel="أضف صوراً"
                >
                  <Ionicons name="add" size={24} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.photoActions}>
              <Pressable
                style={styles.photoAction}
                onPress={() => void addPhotos("library")}
              >
                <Ionicons name="images-outline" size={17} color={colors.blue} />
                <Text style={styles.photoActionText}>من المعرض</Text>
              </Pressable>
              <Pressable
                style={styles.photoAction}
                onPress={() => void addPhotos("camera")}
              >
                <Ionicons name="camera-outline" size={17} color={colors.blue} />
                <Text style={styles.photoActionText}>التقط صورة</Text>
              </Pressable>
            </View>
          </Field>

          <Field label="عنوان الإعلان" hint={`${title.length}/70`}>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              maxLength={70}
              placeholder="مثال: كيا سول ٢٠١٨ وارد أمريكي"
              placeholderTextColor={colors.muted}
              textAlign="right"
            />
          </Field>

          <Field label="السعر بالدينار" hint="اتركه فارغاً للتفاوض">
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              keyboardType="number-pad"
              placeholder="١٢٩٠٥٠٠٠"
              placeholderTextColor={colors.muted}
              textAlign="right"
            />
          </Field>

          <Field label="الحالة">
            <View style={styles.segment}>
              {CONDITIONS.map((option) => (
                <Pressable
                  key={option.key}
                  style={[
                    styles.segmentItem,
                    condition === option.key && styles.segmentActive,
                  ]}
                  onPress={() => setCondition(option.key)}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      condition === option.key && styles.segmentTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="المدينة">
            <View style={styles.options}>
              {(cities.data ?? []).map((city) => (
                <Option
                  key={city.slug}
                  label={city.nameAr}
                  active={citySlug === city.slug}
                  onPress={() => setCitySlug(city.slug)}
                />
              ))}
            </View>
          </Field>

          {(fields.data ?? []).map((field) => (
            <Field
              key={field.key}
              label={field.labelAr + (field.isRequired ? " *" : "")}
              hint={field.unitAr ?? undefined}
            >
              {field.type === "select" ? (
                <View style={styles.options}>
                  {field.options.map((option) => (
                    <Option
                      key={option.value}
                      label={option.labelAr}
                      active={attributes[field.key] === option.value}
                      onPress={() =>
                        setAttributes((previous) => ({
                          ...previous,
                          [field.key]: option.value,
                        }))
                      }
                    />
                  ))}
                </View>
              ) : (
                <TextInput
                  style={styles.input}
                  value={attributes[field.key] ?? ""}
                  onChangeText={(value) =>
                    setAttributes((previous) => ({
                      ...previous,
                      [field.key]: value,
                    }))
                  }
                  keyboardType={
                    field.type === "number" ? "number-pad" : "default"
                  }
                  placeholderTextColor={colors.muted}
                  textAlign="right"
                />
              )}
            </Field>
          ))}

          <Field label="الوصف">
            <TextInput
              style={[styles.input, styles.textarea]}
              value={description}
              onChangeText={setDescription}
              multiline
              placeholder="اكتب الحالة، والمسافة المقطوعة، وسبب البيع…"
              placeholderTextColor={colors.muted}
              textAlign="right"
              textAlignVertical="top"
            />
          </Field>

          <View style={styles.tip}>
            <Ionicons name="bulb-outline" size={18} color={colors.blue} />
            <Text style={styles.tipText}>
              الصور تُضاف بعد الحفظ. الإعلانات بست صور فأكثر تُشاهَد ثلاثة
              أضعاف، فصوّر في ضوء النهار من عدة زوايا.
            </Text>
          </View>

          {problems.length > 0 ? (
            <View style={styles.problems}>
              {problems.map((problem) => (
                <Text key={problem} style={styles.problem}>
                  • {problem}
                </Text>
              ))}
            </View>
          ) : null}

          {!getDevUserId() ? (
            <Text style={styles.authNote}>
              تحتاج تسجيل دخول لنشر إعلان. تسجيل الدخول لم يُبنَ بعد؛ اضبط
              معرّف مستخدم تجريبي من شاشة «حسابي».
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={[styles.submit, !canSubmit && styles.submitDisabled]}
            onPress={() => submit.mutate()}
            disabled={!canSubmit}
            accessibilityRole="button"
          >
            {submit.isPending ? (
              <View style={styles.submitBusy}>
                <ActivityIndicator color={colors.white} size="small" />
                <Text style={styles.submitText}>
                  {uploaded < photos.length
                    ? `يرفع الصور ${arNumber(uploaded + 1)} من ${arNumber(photos.length)}…`
                    : "يحفظ الإعلان…"}
                </Text>
              </View>
            ) : (
              <Text style={styles.submitText}>احفظ الإعلان</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** يجمع كل ما ينقص الإعلان، فيراه المستخدم دفعة واحدة لا حقلاً حقلاً. */
function validate({
  title,
  citySlug,
  fields,
  attributes,
  photoCount,
}: {
  title: string;
  citySlug: string | null;
  fields: { key: string; labelAr: string; isRequired: boolean }[] | undefined;
  attributes: Record<string, string>;
  photoCount: number;
}): string[] {
  const problems: string[] = [];

  if (photoCount === 0) problems.push("أضف صورة واحدة على الأقل");
  if (title.trim().length < 6) problems.push("العنوان قصير جداً");
  if (!citySlug) problems.push("اختر المدينة");

  for (const field of fields ?? []) {
    if (field.isRequired && !attributes[field.key]) {
      problems.push(`${field.labelAr} مطلوب`);
    }
  }

  return problems;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Option({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.option, active && styles.optionActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={active ? { selected: true } : {}}
    >
      <Text style={[styles.optionText, active && styles.optionTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  headerTitle: { fontSize: 18, fontWeight: "600", color: colors.ink },
  form: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  field: { gap: 7 },
  fieldHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fieldLabel: { fontSize: 12.5, fontWeight: "600", color: colors.ink2 },
  fieldHint: { fontSize: 11, color: colors.muted },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.ink,
  },
  textarea: { minHeight: 96 },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  slot: {
    width: "22.4%",
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: 1.4,
    borderStyle: "dashed",
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  slotFilled: {
    width: "22.4%",
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surface2,
  },
  coverTag: {
    position: "absolute",
    bottom: 3,
    right: 3,
    left: 3,
    backgroundColor: "rgba(20,22,28,0.62)",
    borderRadius: 4,
    paddingVertical: 2,
  },
  coverText: { color: colors.white, fontSize: 8.5, textAlign: "center" },
  removePhoto: {
    position: "absolute",
    top: 3,
    left: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(20,22,28,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoActions: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  photoAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  photoActionText: { color: colors.blue, fontSize: 13, fontWeight: "600" },
  submitBusy: { flexDirection: "row", alignItems: "center", gap: space.sm },
  segment: { flexDirection: "row", gap: space.sm },
  segmentItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  segmentActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  segmentText: { fontSize: 13.5, fontWeight: "600", color: colors.ink2 },
  segmentTextActive: { color: colors.white },
  options: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  option: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  optionActive: { backgroundColor: colors.blueSoft, borderColor: colors.blue },
  optionText: { fontSize: 13, color: colors.ink2 },
  optionTextActive: { color: colors.blue, fontWeight: "600" },
  tip: {
    flexDirection: "row",
    gap: space.md,
    backgroundColor: colors.blueSoft,
    borderRadius: radius.md,
    padding: space.md,
  },
  tipText: { flex: 1, fontSize: 12, lineHeight: 21, color: colors.ink2 },
  problems: {
    backgroundColor: "#FDECEA",
    borderRadius: radius.md,
    padding: space.md,
    gap: 4,
  },
  problem: { fontSize: 12.5, color: "#A32B23", lineHeight: 20 },
  authNote: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 21,
    textAlign: "center",
  },
  footer: {
    padding: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  submit: {
    backgroundColor: colors.blue,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitDisabled: { backgroundColor: colors.muted },
  submitText: { color: colors.white, fontWeight: "600", fontSize: 15 },
});
