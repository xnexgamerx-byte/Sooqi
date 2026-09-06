import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
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

  const fields = useQuery({
    queryKey: ["fields", slug],
    queryFn: () => api.categoryFields(slug),
    enabled: Boolean(slug),
  });

  const cities = useQuery({ queryKey: ["cities"], queryFn: api.cities });

  const submit = useMutation({
    mutationFn: async () => {
      const created = await api.createListing({
        categorySlug: slug,
        citySlug: citySlug ?? "",
        title: title.trim(),
        description: description.trim() || undefined,
        priceIqd: price ? Number(price.replace(/[^0-9]/g, "")) : null,
        condition,
        attributes,
      });
      return created;
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["listings"] });
      void queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      Alert.alert(
        "انحفظ الإعلان",
        `رقم إعلانك ${arNumber(created.refNo)}. صار مسودة — أضف الصور وانشره من «إعلاناتي».`,
        [{ text: "تمام", onPress: () => router.dismissAll() }],
      );
    },
    onError: (error) => {
      Alert.alert(
        "تعذّر حفظ الإعلان",
        error instanceof ApiError ? error.message : "حاول مرة ثانية",
      );
    },
  });

  const problems = validate({ title, citySlug, fields: fields.data, attributes });
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
            <Text style={styles.submitText}>
              {submit.isPending ? "جاري الحفظ…" : "احفظ الإعلان"}
            </Text>
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
}: {
  title: string;
  citySlug: string | null;
  fields: { key: string; labelAr: string; isRequired: boolean }[] | undefined;
  attributes: Record<string, string>;
}): string[] {
  const problems: string[] = [];

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
