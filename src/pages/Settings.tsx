import { useState } from "react";
import Modal from "@/components/Modal";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { stripeApi } from "@/lib/stripe";
import {
  ChevronRight, Pencil, Lock, LogOut, UserPlus, UserX,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { settingsApi } from "@/lib/settings";
import { usersApi } from "@/lib/users";
import type { User, StoreProfile } from "@/types/user";

const inputCls =
  "w-full bg-[#242424] border border-white/[0.08] rounded-[10px] px-4 h-12 text-[#f0f0f0] text-base placeholder:text-[#666] focus:border-[#00e5a0] focus:outline-none focus:ring-1 focus:ring-[#00e5a0]/30";
const labelCls = "text-xs text-[#666] uppercase tracking-wider mb-1.5 block";
const sectionLabelCls = "text-xs font-semibold text-[#555] uppercase tracking-wider px-1 mb-1";

function initials(name?: string) {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const roleLabels: Record<string, { label: string; color: string; bg: string }> = {
  owner:     { label: "Propietario", color: "#00e5a0", bg: "rgba(0,229,160,0.12)" },
  cashier:   { label: "Cajero",      color: "#74b9ff", bg: "rgba(116,185,255,0.12)" },
  inventory: { label: "Inventarista", color: "#ff9f43", bg: "rgba(255,159,67,0.12)" },
};

// ── RolePicker ─────────────────────────────────────────────────────────────

function RolePicker({
  value,
  onChange,
}: {
  value: "cashier" | "inventory";
  onChange: (v: "cashier" | "inventory") => void;
}) {
  const opts: { value: "cashier" | "inventory"; label: string; sub: string; color: string; bg: string; border: string }[] = [
    {
      value: "cashier",
      label: "Cajero",
      sub: "Solo puede vender",
      color: "#74b9ff",
      bg: "rgba(116,185,255,0.12)",
      border: "rgba(116,185,255,0.3)",
    },
    {
      value: "inventory",
      label: "Inventarista",
      sub: "Agrega y edita productos",
      color: "#ff9f43",
      bg: "rgba(255,159,67,0.12)",
      border: "rgba(255,159,67,0.3)",
    },
  ];
  return (
    <div className="flex gap-3">
      {opts.map((o) => {
        const sel = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="flex-1 py-3 rounded-[10px] text-center"
            style={{
              border: `1.5px solid ${sel ? o.border : "rgba(255,255,255,0.08)"}`,
              background: sel ? o.bg : "transparent",
              color: sel ? o.color : "#666",
            }}
          >
            <p className="text-sm font-semibold">{o.label}</p>
            <p className="text-xs mt-0.5 opacity-70">{o.sub}</p>
          </button>
        );
      })}
    </div>
  );
}

// ── Modal: Editar Perfil ───────────────────────────────────────────────────

function EditProfileModal({
  user,
  onClose,
}: {
  user: User;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const authStore = useAuthStore();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      await settingsApi.updateProfile({ name, phone });
      // Sync authStore name
      if (authStore.user) {
        const updatedUser = { ...authStore.user, name };
        localStorage.setItem("user", JSON.stringify(updatedUser));
        authStore.login({
          token: authStore.token!,
          user: updatedUser,
          store: authStore.store!,
        });
      }
      qc.invalidateQueries({ queryKey: ["settings", "profile"] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Editar perfil">
      <div className="flex flex-col gap-4">
        <div>
          <label className={labelCls}>Tu nombre</label>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
            autoFocus
          />
        </div>
        <div>
          <label className={labelCls}>Teléfono</label>
          <input
            className={inputCls}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <p className="text-xs text-[#555] mt-1">Usas este número para iniciar sesión</p>
        </div>
        {error && <p className="text-xs text-[#ff6b6b]">{error}</p>}
        <button
          disabled={loading}
          onClick={handleSave}
          className="w-full h-12 mt-1 rounded-[12px] bg-[#00e5a0] text-black font-bold text-sm disabled:opacity-50"
        >
          {loading ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </Modal>
  );
}

// ── Modal: Editar Tienda ───────────────────────────────────────────────────

function EditStoreModal({
  store,
  onClose,
}: {
  store: StoreProfile;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(store.name);
  const [phone, setPhone] = useState(store.phone ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      await settingsApi.updateStore({ name, phone: phone || undefined });
      qc.invalidateQueries({ queryKey: ["settings", "profile"] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Editar tienda">
      <div className="flex flex-col gap-4">
        <div>
          <label className={labelCls}>Nombre de la tienda</label>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
            autoFocus
          />
        </div>
        <div>
          <label className={labelCls}>Teléfono (opcional)</label>
          <input
            className={inputCls}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        {error && <p className="text-xs text-[#ff6b6b]">{error}</p>}
        <button
          disabled={loading}
          onClick={handleSave}
          className="w-full h-12 mt-1 rounded-[12px] bg-[#00e5a0] text-black font-bold text-sm disabled:opacity-50"
        >
          {loading ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </Modal>
  );
}

// ── Modal: Cambiar Contraseña ──────────────────────────────────────────────

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const disabled = !current || !next || !confirm || mismatch || loading;

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      await settingsApi.updatePassword({ current_password: current, new_password: next });
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Cambiar contraseña">
      <div className="flex flex-col gap-4">
        <div>
          <label className={labelCls}>Contraseña actual</label>
          <input
            className={inputCls}
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className={labelCls}>Nueva contraseña</label>
          <input
            className={inputCls}
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <p className="text-xs text-[#555] mt-1">Mínimo 6 caracteres</p>
        </div>
        <div>
          <label className={labelCls}>Confirmar contraseña</label>
          <input
            className={inputCls}
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {mismatch && <p className="text-xs text-[#ff6b6b] mt-1">Las contraseñas no coinciden</p>}
        </div>
        {error && <p className="text-xs text-[#ff6b6b]">{error}</p>}
        {success && (
          <p className="text-sm text-[#00e5a0] text-center">✓ Contraseña actualizada correctamente</p>
        )}
        <button
          disabled={disabled}
          onClick={handleSave}
          className="w-full h-12 mt-1 rounded-[12px] bg-[#00e5a0] text-black font-bold text-sm disabled:opacity-50"
        >
          {loading ? "Actualizando..." : "Actualizar contraseña"}
        </button>
      </div>
    </Modal>
  );
}

// ── Modal: Nuevo Usuario ───────────────────────────────────────────────────

function NewUserModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"cashier" | "inventory">("cashier");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      await usersApi.create({ name: name.trim(), phone: phone.trim(), password, role });
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear usuario");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Nuevo usuario">
      <div className="flex flex-col gap-4">
        <div>
          <label className={labelCls}>Nombre</label>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
            autoFocus
          />
        </div>
        <div>
          <label className={labelCls}>Teléfono</label>
          <input
            className={inputCls}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <p className="text-xs text-[#555] mt-1">Usará este número para iniciar sesión</p>
        </div>
        <div>
          <label className={labelCls}>Contraseña temporal</label>
          <input
            className={inputCls}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Rol</label>
          <RolePicker value={role} onChange={setRole} />
        </div>
        {error && <p className="text-xs text-[#ff6b6b]">{error}</p>}
        <button
          disabled={loading || !name.trim() || !phone.trim() || !password}
          onClick={handleCreate}
          className="w-full h-12 mt-1 rounded-[12px] bg-[#00e5a0] text-black font-bold text-sm disabled:opacity-50"
        >
          {loading ? "Creando..." : "Crear usuario"}
        </button>
      </div>
    </Modal>
  );
}

// ── Modal: Editar Usuario ──────────────────────────────────────────────────

function EditUserModal({ user, onClose }: { user: User; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [role, setRole] = useState<"cashier" | "inventory">(
    user.role === "owner" ? "cashier" : (user.role as "cashier" | "inventory")
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      await usersApi.update(user.id, { name, phone, role });
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Editar usuario">
      <div className="flex flex-col gap-4">
        <div>
          <label className={labelCls}>Nombre</label>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
            autoFocus
          />
        </div>
        <div>
          <label className={labelCls}>Teléfono</label>
          <input
            className={inputCls}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Rol</label>
          <RolePicker value={role} onChange={setRole} />
        </div>
        {error && <p className="text-xs text-[#ff6b6b]">{error}</p>}
        <button
          disabled={loading}
          onClick={handleSave}
          className="w-full h-12 mt-1 rounded-[12px] bg-[#00e5a0] text-black font-bold text-sm disabled:opacity-50"
        >
          {loading ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </Modal>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

type Modal = "editProfile" | "editStore" | "password" | "newUser" | null;

export default function Settings() {
  const navigate = useNavigate();
  const { user: authUser, logout } = useAuthStore();
  const qc = useQueryClient();

  const [modal, setModal] = useState<Modal>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const { data: profile } = useQuery({
    queryKey: ["settings", "profile"],
    queryFn: settingsApi.getProfile,
  });

  const { data: subStatus } = useQuery({
    queryKey: ["stripe", "status"],
    queryFn: stripeApi.getStatus,
    enabled: authUser?.role === "owner",
  });

  const { data: teamUsers } = useQuery({
    queryKey: ["users"],
    queryFn: usersApi.list,
    enabled: authUser?.role === "owner",
  });

  const user = profile?.user ?? (authUser as User | null);
  const store = profile?.store ?? null;
  const role = user?.role ?? authUser?.role ?? "cashier";

  const handleDeactivate = async (target: User) => {
    if (!confirm(`¿Desactivar a ${target.name}?\nYa no podrá iniciar sesión.`)) return;
    try {
      await usersApi.remove(target.id);
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch {
      // no-op
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const roleCfg = roleLabels[role] ?? roleLabels.cashier;

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
      {/* Header */}
      <div
        className="px-4 pt-4 pb-3 flex items-center gap-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center text-[#f0f0f0] text-lg"
          style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          ←
        </button>
        <h1 className="text-xl font-bold text-[#f0f0f0]">Configuración</h1>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 pb-10">
        {/* Card de perfil */}
        <div
          className="bg-[#1a1a1a] rounded-[16px] px-5 py-5 flex items-center gap-4"
          style={{ border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div
            className="w-16 h-16 rounded-full flex-shrink-0 flex items-center justify-center text-2xl font-bold text-[#00e5a0]"
            style={{ background: "rgba(0,229,160,0.1)", border: "2px solid rgba(0,229,160,0.25)" }}
          >
            {initials(user?.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-[#f0f0f0] truncate">{user?.name ?? "—"}</p>
            <p className="text-sm text-[#666] mt-0.5">{user?.phone ?? "—"}</p>
            <span
              className="mt-2 inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold"
              style={{ background: roleCfg.bg, color: roleCfg.color }}
            >
              {roleCfg.label}
            </span>
          </div>
          <button
            onClick={() => user && setModal("editProfile")}
            className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center"
            style={{ background: "#242424", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <Pencil size={16} color="#666" />
          </button>
        </div>

        {/* Sección: Mi Tienda */}
        {role === "owner" && store && (
          <>
            <p className={sectionLabelCls}>Mi Tienda</p>
            <div
              className="bg-[#1a1a1a] rounded-[16px] overflow-hidden"
              style={{ border: "1px solid rgba(255,255,255,0.08)" }}
            >
              {/* Nombre tienda */}
              <button
                onClick={() => setModal("editStore")}
                className="w-full px-5 py-4 flex justify-between items-center text-left"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div>
                  <p className="text-xs text-[#666] mb-0.5">NOMBRE DE LA TIENDA</p>
                  <p className="text-sm font-semibold text-[#f0f0f0]">{store.name}</p>
                </div>
                <ChevronRight size={16} color="#555" />
              </button>
              {/* Plan */}
              <div className="px-5 py-4 flex justify-between items-center">
                <div>
                  <p className="text-xs text-[#666] mb-0.5">PLAN</p>
                  <p
                    className="text-sm font-semibold"
                    style={{
                      color: store.plan === "free" ? "#999" : "#00e5a0",
                    }}
                  >
                    {subStatus?.plan_name ?? (store.plan === "free" ? "Gratuito" : store.plan)}
                    {subStatus?.is_active && " ✓"}
                  </p>
                  {subStatus?.expires_at && subStatus.is_active && (
                    <p className="text-xs text-[#555] mt-0.5">
                      Vence: {new Date(subStatus.expires_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}
                </div>
                {store.plan === "free" || !subStatus?.is_active ? (
                  <button
                    onClick={() => navigate("/subscription")}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold text-[#00e5a0]"
                    style={{ background: "rgba(0,229,160,0.12)", border: "1px solid rgba(0,229,160,0.25)" }}
                  >
                    Mejorar plan →
                  </button>
                ) : (
                  <button
                    onClick={() => navigate("/subscription")}
                    className="text-xs text-[#555]"
                  >
                    Gestionar →
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Sección: Equipo */}
        {role === "owner" && (
          <>
            <p className={sectionLabelCls}>Equipo</p>
            <div
              className="bg-[#1a1a1a] rounded-[16px] overflow-hidden"
              style={{ border: "1px solid rgba(255,255,255,0.08)" }}
            >
              {(teamUsers ?? []).map((u, i) => {
                const rc = roleLabels[u.role] ?? roleLabels.cashier;
                const isOwner = u.role === "owner";
                return (
                  <div
                    key={u.id}
                    className="px-5 py-4 flex items-center gap-3"
                    style={{
                      borderBottom: i < (teamUsers?.length ?? 0) - 1 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                      opacity: u.active ? 1 : 0.4,
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-[#666]"
                      style={{ background: "#242424", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      {initials(u.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#f0f0f0] truncate">{u.name}</p>
                      <span
                        className="mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ background: rc.bg, color: rc.color }}
                      >
                        {u.active ? rc.label : "Inactivo"}
                      </span>
                    </div>
                    {!isOwner && u.active && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setEditingUser(u); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: "#242424", border: "1px solid rgba(255,255,255,0.08)" }}
                        >
                          <Pencil size={14} color="#666" />
                        </button>
                        <button
                          onClick={() => handleDeactivate(u)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.2)" }}
                        >
                          <UserX size={14} color="#ff6b6b" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Agregar */}
              <button
                onClick={() => setModal("newUser")}
                className="w-full px-5 py-4 flex items-center gap-3"
                style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
              >
                <UserPlus size={18} color="#00e5a0" />
                <span className="text-sm font-semibold text-[#00e5a0]">
                  Agregar cajero o inventarista
                </span>
              </button>
            </div>
          </>
        )}

        {/* Sección: Seguridad */}
        <p className={sectionLabelCls}>Seguridad</p>
        <div
          className="bg-[#1a1a1a] rounded-[16px] overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <button
            onClick={() => setModal("password")}
            className="w-full px-5 py-4 flex justify-between items-center"
          >
            <div className="flex items-center gap-3">
              <Lock size={18} color="#666" />
              <span className="text-sm font-medium text-[#f0f0f0]">Cambiar contraseña</span>
            </div>
            <ChevronRight size={16} color="#555" />
          </button>
        </div>

        {/* Sección: Información */}
        <p className={sectionLabelCls}>Información</p>
        <div
          className="bg-[#1a1a1a] rounded-[16px] overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {[
            { label: "Versión", value: "1.0.0", mono: true },
          ].map((row, i, arr) => (
            <div
              key={row.label}
              className="px-5 py-4 flex justify-between text-sm"
              style={i < arr.length - 1 ? { borderBottom: "1px solid rgba(255,255,255,0.06)" } : undefined}
            >
              <span className="text-[#f0f0f0]">{row.label}</span>
              <span className={`text-[#666] ${row.mono ? "font-mono" : ""}`}>{row.value}</span>
            </div>
          ))}
        </div>

        {/* Cerrar sesión */}
        <button
          onClick={handleLogout}
          className="w-full h-12 mt-2 rounded-[12px] flex items-center justify-center gap-2 font-semibold text-sm text-[#ff6b6b]"
          style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.2)" }}
        >
          <LogOut size={16} color="#ff6b6b" />
          Cerrar sesión
        </button>

        <p className="text-center text-[10px] text-[#2a2a2a] mt-6">Filipenses 4:13</p>
      </div>

      {/* Modales */}
      {modal === "editProfile" && user && (
        <EditProfileModal user={user} onClose={() => setModal(null)} />
      )}
      {modal === "editStore" && store && (
        <EditStoreModal store={store} onClose={() => setModal(null)} />
      )}
      {modal === "password" && (
        <ChangePasswordModal onClose={() => setModal(null)} />
      )}
      {modal === "newUser" && (
        <NewUserModal onClose={() => setModal(null)} />
      )}
      {editingUser && (
        <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} />
      )}
    </div>
  );
}
