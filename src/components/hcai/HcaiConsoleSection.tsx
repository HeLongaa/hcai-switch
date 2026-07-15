/**
 * HCAI 控制台区域：未登录显示登录 UI；已登录展示额度/用量等内容。
 * 邮箱密码登录对接 HCAI `/api/v1/auth/login`，会话持久化到 localStorage。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { openUrl } from "@tauri-apps/plugin-opener";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  Eye,
  EyeOff,
  Github,
  Loader2,
  Lock,
  LogIn,
  Mail,
  X,
} from "lucide-react";
import { ProviderIcon } from "@/components/ProviderIcon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  fetchHcaiPublicSettings,
  isHcaiOauthLoginActive,
  loginHcaiAccount,
  loginHcaiWithGithub,
  loginHcaiWithGoogle,
  takePendingHcaiOauthResult,
} from "@/lib/hcai/api";
import {
  clearHcaiSession,
  loadHcaiSession,
  saveHcaiSession,
  sessionFromLoginResult,
} from "@/lib/hcai/session";
import {
  HCAI_ICON,
  HCAI_WEBSITE,
  type HcaiAuthSession,
  type HcaiLoginAgreementDocument,
} from "@/lib/hcai/types";
import { HcaiLoggedInConsole } from "@/components/hcai/console/HcaiLoggedInConsole";
import googleIconUrl from "@/assets/icons/google.svg?url";

/** 公开设置拉取失败时的兜底文档标题（内容需成功拉取后才可查看） */
const FALLBACK_AGREEMENT_DOCS: HcaiLoginAgreementDocument[] = [
  { id: "terms", title: "服务条款", content_md: "" },
  { id: "privacy", title: "隐私政策", content_md: "" },
  { id: "supported-regions", title: "支持的国家与地区", content_md: "" },
];

/** 简易 Markdown 渲染：支持标题式加粗行、列表、引用、段落与行内 **粗体** */
function renderInlineMd(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function SimpleMarkdown({ content }: { content: string }) {
  const blocks = useMemo(() => {
    const lines = content.replace(/\r\n/g, "\n").split("\n");
    const nodes: React.ReactNode[] = [];
    let i = 0;
    let key = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        i += 1;
        continue;
      }

      // blockquote
      if (trimmed.startsWith(">")) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith(">")) {
          quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
          i += 1;
        }
        nodes.push(
          <blockquote
            key={key++}
            className="border-l-2 border-primary/50 pl-3 my-3 text-muted-foreground italic"
          >
            {quoteLines.map((ql, qi) => (
              <p key={qi} className="text-sm leading-relaxed">
                {renderInlineMd(ql)}
              </p>
            ))}
          </blockquote>,
        );
        continue;
      }

      // unordered list
      if (/^[-*]\s+/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
          i += 1;
        }
        nodes.push(
          <ul key={key++} className="list-disc pl-5 my-2 space-y-1">
            {items.map((item, ii) => (
              <li key={ii} className="text-sm leading-relaxed text-foreground/90">
                {renderInlineMd(item)}
              </li>
            ))}
          </ul>,
        );
        continue;
      }

      // ordered list
      if (/^\d+\.\s+/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
          i += 1;
        }
        nodes.push(
          <ol key={key++} className="list-decimal pl-5 my-2 space-y-1">
            {items.map((item, ii) => (
              <li key={ii} className="text-sm leading-relaxed text-foreground/90">
                {renderInlineMd(item)}
              </li>
            ))}
          </ol>,
        );
        continue;
      }

      // section heading: entire line is **...**
      if (/^\*\*[^*]+\*\*$/.test(trimmed)) {
        nodes.push(
          <h4
            key={key++}
            className="text-sm font-semibold text-foreground mt-4 mb-2 first:mt-0"
          >
            {trimmed.slice(2, -2)}
          </h4>,
        );
        i += 1;
        continue;
      }

      // paragraph (merge consecutive non-empty plain lines)
      const para: string[] = [trimmed];
      i += 1;
      while (
        i < lines.length &&
        lines[i].trim() &&
        !lines[i].trim().startsWith(">") &&
        !/^[-*]\s+/.test(lines[i].trim()) &&
        !/^\d+\.\s+/.test(lines[i].trim()) &&
        !/^\*\*[^*]+\*\*$/.test(lines[i].trim())
      ) {
        para.push(lines[i].trim());
        i += 1;
      }
      nodes.push(
        <p key={key++} className="text-sm leading-relaxed text-foreground/90 my-1.5">
          {renderInlineMd(para.join(" "))}
        </p>,
      );
    }

    return nodes;
  }, [content]);

  if (!content.trim()) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        暂无内容
      </p>
    );
  }

  return <div className="space-y-0.5">{blocks}</div>;
}

export interface HcaiConsoleSectionProps {
  /**
   * 兼容旧用法；登录后内容由 HcaiLoggedInConsole 承载，children 不再展示。
   */
  children?: React.ReactNode;
  /** @deprecated 登录后不再使用 */
  subtitle?: React.ReactNode;
  canRefresh?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** 控制台「使用密钥」写入应用配置成功后回调 */
  onProvidersChanged?: () => void;
  className?: string;
}

export function HcaiConsoleSection({
  children,
  subtitle,
  canRefresh,
  refreshing,
  onRefresh,
  onProvidersChanged,
  className,
}: HcaiConsoleSectionProps) {
  const { t } = useTranslation();
  const [session, setSession] = useState<HcaiAuthSession | null>(() =>
    loadHcaiSession(),
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [agreementChecked, setAgreementChecked] = useState(false);
  const [agreementDocs, setAgreementDocs] = useState<
    HcaiLoginAgreementDocument[]
  >(FALLBACK_AGREEMENT_DOCS);
  const [agreementEnabled, setAgreementEnabled] = useState(true);
  const [githubOauthEnabled, setGithubOauthEnabled] = useState(true);
  const [googleOauthEnabled, setGoogleOauthEnabled] = useState(true);
  const [docsLoading, setDocsLoading] = useState(true);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [oauthProvider, setOauthProvider] = useState<"github" | "google" | null>(
    null,
  );
  const oauthSubmitting = oauthProvider !== null;

  const activeDoc = useMemo(
    () => agreementDocs.find((d) => d.id === activeDocId) ?? null,
    [agreementDocs, activeDocId],
  );

  useEffect(() => {
    if (session) return;
    let cancelled = false;
    let unlisten: UnlistenFn | undefined;

    const recoverDeepLinkLogin = async () => {
      if (cancelled || isHcaiOauthLoginActive()) return;
      try {
        const result = await takePendingHcaiOauthResult();
        if (!result || cancelled) return;
        const next = sessionFromLoginResult(result);
        saveHcaiSession(next);
        setSession(next);
        setPassword("");
        toast.success(
          t("hcai.console.loginOk", {
            defaultValue: "登录成功",
          }),
        );
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "GitHub 登录回调处理失败";
        toast.error(message);
      }
    };

    void listen("hcai-oauth-result", () => {
      void recoverDeepLinkLogin();
    })
      .then((stop) => {
        if (cancelled) {
          stop();
          return;
        }
        unlisten = stop;
        void recoverDeepLinkLogin();
      })
      .catch((error: unknown) => {
        console.error("[HCAI] OAuth result listener failed:", error);
        void recoverDeepLinkLogin();
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [session, t]);

  useEffect(() => {
    if (session) return;
    let cancelled = false;
    setDocsLoading(true);
    void fetchHcaiPublicSettings()
      .then((data) => {
        if (cancelled) return;
        setAgreementEnabled(data.login_agreement_enabled !== false);
        setGithubOauthEnabled(data.github_oauth_enabled !== false);
        setGoogleOauthEnabled(data.google_oauth_enabled !== false);
        const docs = data.login_agreement_documents?.filter(
          (d) => d?.id && d?.title,
        );
        if (docs && docs.length > 0) {
          setAgreementDocs(docs);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // 保留兜底标题；打开弹窗时若无 content 会提示暂无内容
        console.error("[HCAI] load public settings failed:", err);
        toast.error(
          t("hcai.console.agreementLoadFailed", {
            defaultValue: "服务条款加载失败，请检查网络后重试",
          }),
        );
      })
      .finally(() => {
        if (!cancelled) setDocsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session, t]);

  const canSubmitAuth = !agreementEnabled || agreementChecked;

  const handleLogout = useCallback(() => {
    clearHcaiSession();
    setSession(null);
    setPassword("");
    setAgreementChecked(false);
  }, []);

  const ensureAgreement = useCallback(() => {
    if (agreementEnabled && !agreementChecked) {
      toast.error(
        t("hcai.console.agreementRequired", {
          defaultValue: "请先阅读并同意服务条款",
        }),
      );
      return false;
    }
    return true;
  }, [agreementChecked, agreementEnabled, t]);

  const handleLogin = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!ensureAgreement()) return;
      const trimmed = email.trim();
      if (!trimmed) {
        toast.error(
          t("hcai.console.emailRequired", {
            defaultValue: "请输入邮箱",
          }),
        );
        return;
      }
      if (!password) {
        toast.error(
          t("hcai.console.passwordRequired", {
            defaultValue: "请输入密码",
          }),
        );
        return;
      }
      setSubmitting(true);
      try {
        const result = await loginHcaiAccount(trimmed, password);
        const next = sessionFromLoginResult(result);
        saveHcaiSession(next);
        setSession(next);
        setPassword("");
        toast.success(
          t("hcai.console.loginOk", {
            defaultValue: "登录成功",
          }),
        );
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : t("hcai.console.loginFailed", {
                  defaultValue: "登录失败，请检查邮箱和密码",
                });
        toast.error(msg);
      } finally {
        setSubmitting(false);
      }
    },
    [email, ensureAgreement, password, t],
  );

  const handleGithubLogin = useCallback(async () => {
    if (!ensureAgreement()) return;
    if (!githubOauthEnabled) {
      toast.message(
        t("hcai.console.oauthDisabled", {
          defaultValue: "GitHub 登录暂未开放",
        }),
      );
      return;
    }
    setOauthProvider("github");
    try {
      const result = await loginHcaiWithGithub();
      const next = sessionFromLoginResult(result);
      saveHcaiSession(next);
      setSession(next);
      setPassword("");
      toast.success(
        t("hcai.console.loginOk", {
          defaultValue: "登录成功",
        }),
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : t("hcai.console.oauthFailed", {
                defaultValue: "GitHub 登录失败",
              });
      // 用户关闭窗口：不弹错误打扰
      if (/取消|cancel/i.test(msg)) {
        toast.message(
          t("hcai.console.oauthCancelled", {
            defaultValue: "已取消 GitHub 登录",
          }),
        );
      } else {
        toast.error(msg);
      }
    } finally {
      setOauthProvider(null);
    }
  }, [ensureAgreement, githubOauthEnabled, t]);

  const handleGoogleLogin = useCallback(async () => {
    if (!ensureAgreement()) return;
    if (!googleOauthEnabled) {
      toast.message(
        t("hcai.console.oauthDisabled", {
          defaultValue: "Google 登录暂未开放",
        }),
      );
      return;
    }
    setOauthProvider("google");
    try {
      const result = await loginHcaiWithGoogle();
      const next = sessionFromLoginResult(result);
      saveHcaiSession(next);
      setSession(next);
      setPassword("");
      toast.success(
        t("hcai.console.loginOk", {
          defaultValue: "登录成功",
        }),
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : t("hcai.console.oauthFailed", {
                defaultValue: "Google 登录失败",
              });
      toast.error(msg);
    } finally {
      setOauthProvider(null);
    }
  }, [ensureAgreement, googleOauthEnabled, t]);

  const openDoc = useCallback((id: string) => {
    setActiveDocId(id);
  }, []);

  // —— 未登录 ——
  if (!session) {
    return (
      <section
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card",
          className,
        )}
      >
        <div className="relative flex-1 min-h-0 overflow-y-auto px-4 py-8 sm:px-8">
          {/* soft grid backdrop */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.15]"
            style={{
              backgroundImage:
                "linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />

          <div className="relative mx-auto w-full max-w-[520px] space-y-6">
            <div className="flex flex-col items-center text-center gap-2">
              <div className="h-14 w-14 rounded-2xl bg-background shadow-sm border border-border/60 flex items-center justify-center">
                <ProviderIcon icon={HCAI_ICON} name="HCAI" size={32} />
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-primary">
                HCAI
              </h2>
              <p className="text-sm text-muted-foreground max-w-xs">
                {t("hcai.tagline", {
                  defaultValue: "全球 AI 算力分发平台 · 安全连接，智创未来",
                })}
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 bg-background/90 backdrop-blur-sm shadow-sm p-5 sm:p-6 space-y-5">
              <div className="text-center space-y-1">
                <h3 className="text-lg font-semibold">
                  {t("hcai.console.welcomeBack", {
                    defaultValue: "欢迎回来",
                  })}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("hcai.console.loginHint", {
                    defaultValue: "登录您的账户以继续",
                  })}
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleLogin}>
                <div className="space-y-2">
                  <Label htmlFor="hcai-console-email">
                    {t("hcai.console.email", { defaultValue: "邮箱" })}
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="hcai-console-email"
                      type="email"
                      autoComplete="username"
                      placeholder={t("hcai.console.emailPlaceholder", {
                        defaultValue: "请输入邮箱",
                      })}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9 h-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hcai-console-password">
                    {t("hcai.console.password", { defaultValue: "密码" })}
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="hcai-console-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder={t("hcai.console.passwordPlaceholder", {
                        defaultValue: "请输入密码",
                      })}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9 pr-10 h-10"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={
                        showPassword
                          ? t("hcai.console.hidePassword", {
                              defaultValue: "隐藏密码",
                            })
                          : t("hcai.console.showPassword", {
                              defaultValue: "显示密码",
                            })
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() =>
                        toast.message(
                          t("hcai.console.forgotComingSoon", {
                            defaultValue: "忘记密码流程即将接入",
                          }),
                        )
                      }
                    >
                      {t("hcai.console.forgotPassword", {
                        defaultValue: "忘记密码？",
                      })}
                    </button>
                  </div>
                </div>

                {agreementEnabled ? (
                  <div className="flex items-start gap-2.5 pt-0.5">
                    <Checkbox
                      id="hcai-console-agreement"
                      checked={agreementChecked}
                      onCheckedChange={(v) => setAgreementChecked(v === true)}
                      className="mt-0.5 border-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      disabled={docsLoading}
                    />
                    <label
                      htmlFor="hcai-console-agreement"
                      className="text-xs leading-relaxed text-muted-foreground cursor-pointer select-none"
                    >
                      {t("hcai.console.agreementPrefix", {
                        defaultValue: "我已阅读并同意",
                      })}
                      {agreementDocs.map((doc, idx) => (
                        <span key={doc.id}>
                          {idx > 0 ? (
                            <span className="text-muted-foreground">、</span>
                          ) : (
                            " "
                          )}
                          <button
                            type="button"
                            className="text-primary hover:underline font-medium"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openDoc(doc.id);
                            }}
                          >
                            《{doc.title}》
                          </button>
                        </span>
                      ))}
                      {docsLoading ? (
                        <span className="ml-1 inline-flex items-center text-muted-foreground/70">
                          <Loader2 className="h-3 w-3 animate-spin" />
                        </span>
                      ) : null}
                    </label>
                  </div>
                ) : null}

                <Button
                  type="submit"
                  disabled={submitting || !canSubmitAuth}
                  className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : (
                    <LogIn className="h-4 w-4 mr-1.5" />
                  )}
                  {t("hcai.console.login", { defaultValue: "登录" })}
                </Button>
              </form>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-background px-2 text-muted-foreground">
                    {t("hcai.console.orContinueWith", {
                      defaultValue: "或使用其他继续",
                    })}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10"
                  disabled={
                    !canSubmitAuth ||
                    submitting ||
                    oauthSubmitting ||
                    !githubOauthEnabled
                  }
                  onClick={() => void handleGithubLogin()}
                >
                  {oauthProvider === "github" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Github className="h-4 w-4 mr-2" />
                  )}
                  GitHub
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10"
                  disabled={
                    !canSubmitAuth ||
                    submitting ||
                    oauthSubmitting ||
                    !googleOauthEnabled
                  }
                  onClick={() => void handleGoogleLogin()}
                >
                  {oauthProvider === "google" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <img
                      src={googleIconUrl}
                      alt=""
                      aria-hidden
                      className="h-4 w-4 mr-2"
                    />
                  )}
                  Google
                </Button>
              </div>

              <p className="text-center text-xs text-muted-foreground">
                {t("hcai.console.noAccount", {
                  defaultValue: "还没有账户？",
                })}{" "}
                <button
                  type="button"
                  className="text-primary hover:underline font-medium"
                  onClick={() => {
                    void openUrl(HCAI_WEBSITE).catch(() => {
                      window.open(HCAI_WEBSITE, "_blank");
                    });
                  }}
                >
                  {t("hcai.console.register", { defaultValue: "注册" })}
                </button>
              </p>
            </div>

          </div>
        </div>

        <Dialog
          open={!!activeDoc}
          onOpenChange={(open) => {
            if (!open) setActiveDocId(null);
          }}
        >
          <DialogContent
            className="max-w-lg sm:max-w-xl max-h-[85vh] p-0 gap-0 overflow-hidden"
            zIndex="nested"
          >
            <DialogHeader className="flex-row items-center justify-between space-y-0 gap-3 px-5 py-4">
              <DialogTitle className="text-base">
                {activeDoc?.title ??
                  t("hcai.console.agreementTitle", {
                    defaultValue: "服务条款",
                  })}
              </DialogTitle>
              <DialogClose
                className="shrink-0 rounded-md p-1.5 -mr-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                aria-label={t("common.close", { defaultValue: "关闭" })}
              >
                <X className="h-4 w-4" />
              </DialogClose>
            </DialogHeader>
            <div className="overflow-y-auto px-5 py-4 min-h-0 flex-1">
              {activeDoc ? (
                <SimpleMarkdown content={activeDoc.content_md || ""} />
              ) : null}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border-default bg-muted/20">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveDocId(null)}
              >
                {t("common.close", { defaultValue: "关闭" })}
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  setAgreementChecked(true);
                  setActiveDocId(null);
                }}
              >
                {t("hcai.console.agreementAgree", {
                  defaultValue: "已阅读并同意",
                })}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </section>
    );
  }

// —— 已登录：多板块控制台（前端占位） ——
  // subtitle / children / onRefresh 保留接口兼容，内容改由 HcaiLoggedInConsole 承载
  void children;
  void subtitle;
  void canRefresh;
  void refreshing;
  void onRefresh;

  return (
    <HcaiLoggedInConsole
      session={session}
      onLogout={handleLogout}
      onProvidersChanged={onProvidersChanged}
      className={className}
    />
  );
}
