import { signIn } from "@/lib/auth/config";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  return (
    <main className="login-shell">
      <div className="login-card">
        <div className="brand" style={{ marginBottom: 18 }}>
          <div className="logo">一</div>
          <div>
            <h1 style={{ color: "var(--ink)" }}>一一妈咪好物团</h1>
            <p style={{ color: "var(--muted)" }}>Yiyi Shipping Assistant</p>
          </div>
        </div>
        <p className="muted">使用 Google 登录。仅允许名单内邮箱可访问订单与 Shippo 测试接口。</p>
        <LoginError searchParams={searchParams} />
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
          style={{ marginTop: 18 }}
        >
          <button className="btn" type="submit">
            使用 Google 登录
          </button>
        </form>
      </div>
    </main>
  );
}

async function LoginError({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  const sp = searchParams ? await searchParams : undefined;
  if (!sp?.error) return null;
  return <div className="note">登录失败或邮箱不在允许名单中（{sp.error}）。</div>;
}
