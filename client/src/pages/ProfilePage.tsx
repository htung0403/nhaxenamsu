import React from 'react';
import {
  User, Mail, Phone, MapPin, Briefcase, Calendar,
  ShieldCheck, Camera, Fingerprint,
  Heart, Landmark, Shield, Info,
  IdCard, UserCircle, BriefcaseIcon, MapPinIcon,
  WalletIcon,
  X, Edit, Trash2, Save, Loader2, KeyRound
} from 'lucide-react';
import { clsx } from 'clsx';
import { useState, useRef, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useBreadcrumbs } from '../context/BreadcrumbContext';
import { useEmployee, useUpdateEmployee } from '../hooks/queries/useHR';
import { useCustomerByUserId } from '../hooks/queries/useCustomers';
import { useRoleSalaries } from '../hooks/queries/usePriceSettings';
import LoadingSkeleton from '../components/shared/LoadingSkeleton';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { translateRole } from '../lib/utils';
import { uploadApi } from '../api/uploadApi';
import { authApi } from '../api/authApi';
import toast from 'react-hot-toast';
import { cloudinaryThumb } from '../lib/cloudinaryUrl';

type ProfileFormState = {
  full_name: string;
  phone: string;
  date_of_birth: string;
  gender: '' | 'male' | 'female' | 'other';
  citizen_id: string;
  job_title: string;
  department: string;
  personal_email: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  city: string;
  district: string;
  ward: string;
  address_line: string;
  temporary_address: string;
};

const ProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { setDynamicLabel } = useBreadcrumbs();
  const { user, updateUser } = useAuth();
  const { avatar } = useTheme();
  const { mutateAsync: updateEmployeeProfile } = useUpdateEmployee();
  const { data: salaryRoles } = useRoleSalaries();

  const isCurrentUser = !id || id === user?.id;
  const targetId = id || user?.id || '';

  // Fetch employee data
  const { data: employeeData, isLoading: loadingEmployee, refetch: refetchEmployee } = useEmployee(targetId);

  // Fetch customer data
  const { data: customerData, isLoading: loadingCustomer, refetch: refetchCustomer } = useCustomerByUserId(targetId);

  const isCustomer = isCurrentUser ? user?.role === 'customer' : !!customerData;
  const isAdmin = user?.role === 'admin';
  const canEditProfile = !isCustomer && (isCurrentUser || isAdmin);
  /** Chỉ admin, khi mở hồ sơ nhân viên khác — khớp cấp bậc lương (role_key trên profiles). */
  const canEditEmployeeRank = isAdmin && !isCurrentUser && !isCustomer;
  /** Đổi mật khẩu: tài khoản của mình, hoặc admin đang xem hồ sơ nhân viên (không phải khách). */
  const showPasswordButton =
    isCurrentUser || (isAdmin && !isCurrentUser && !isCustomer && Boolean(targetId));
  const showAvatarButton = isCurrentUser;
  const showEditButton = canEditProfile;
  const actionButtonCount =
    Number(showAvatarButton) + Number(showEditButton) + Number(showPasswordButton);
  const actionGridClass =
    actionButtonCount >= 3 ? 'grid-cols-3' : actionButtonCount === 2 ? 'grid-cols-2' : 'grid-cols-1';

  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordOld, setPasswordOld] = useState('');
  const [passwordNew, setPasswordNew] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [salaryRankKeyDraft, setSalaryRankKeyDraft] = useState('');
  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    full_name: '',
    phone: '',
    date_of_birth: '',
    gender: '',
    citizen_id: '',
    job_title: '',
    department: '',
    personal_email: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
    city: '',
    district: '',
    ward: '',
    address_line: '',
    temporary_address: '',
  });
  const modalRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLoading = isCustomer ? loadingCustomer : loadingEmployee;
  const profileData = isCustomer ? customerData : employeeData;
  const displayUser = (isCurrentUser ? user : (employeeData || customerData)) as any;

  const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayUser?.full_name || 'User')}&background=random&color=random&size=128`;
  const displayAvatar = isCurrentUser ? (user?.avatar_url || avatar || defaultAvatar) : ((displayUser as any)?.avatar_url || defaultAvatar);

  const toDateInput = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  };

  const employeeProfile = profileData as any;

  useEffect(() => {
    if (isCustomer || !employeeProfile) return;
    setProfileForm({
      full_name: displayUser?.full_name || '',
      phone: employeeProfile?.phone || '',
      date_of_birth: toDateInput(employeeProfile?.date_of_birth),
      gender: (employeeProfile?.gender as ProfileFormState['gender']) || '',
      citizen_id: employeeProfile?.citizen_id || '',
      job_title: employeeProfile?.job_title || '',
      department: employeeProfile?.department || '',
      personal_email: employeeProfile?.personal_email || '',
      emergency_contact_name: employeeProfile?.emergency_contact_name || '',
      emergency_contact_phone: employeeProfile?.emergency_contact_phone || '',
      emergency_contact_relationship: employeeProfile?.emergency_contact_relationship || '',
      city: employeeProfile?.city || '',
      district: employeeProfile?.district || '',
      ward: employeeProfile?.ward || '',
      address_line: employeeProfile?.address_line || '',
      temporary_address: employeeProfile?.temporary_address || '',
    });
    if (canEditEmployeeRank) {
      setSalaryRankKeyDraft(String(employeeProfile?.role || 'staff'));
    }
  }, [isCustomer, employeeProfile, displayUser?.full_name, canEditEmployeeRank]);

  const salaryRankSelectOptions = React.useMemo(() => {
    const base = (salaryRoles || []).map((r) => ({ value: r.role_key, label: r.role_name }));
    const key = displayUser?.role as string | undefined;
    if (key && !base.some((o) => o.value === key)) {
      return [{ value: key, label: translateRole(key) }, ...base];
    }
    if (base.length === 0 && key) {
      return [{ value: key, label: translateRole(key) }];
    }
    return base;
  }, [salaryRoles, displayUser?.role]);

  const employeeRankLabel = React.useMemo(() => {
    const key = displayUser?.role as string | undefined;
    if (!key) return '---';
    const match = salaryRoles?.find((r) => r.role_key === key);
    return match?.role_name || translateRole(key);
  }, [displayUser?.role, salaryRoles]);

  /** Chức vụ hiển thị: không dùng mã role_key (vd. tai_xe_xe_lon) — ưu tiên tên cấp bậc lương hoặc job_title do người nhập. */
  const jobTitleDisplay = React.useMemo(() => {
    const roleKey = displayUser?.role as string | undefined;
    const raw = employeeProfile?.job_title?.trim();
    if (raw) {
      if (roleKey && raw === roleKey) return employeeRankLabel;
      const titleAsSalary = salaryRoles?.find((r) => r.role_key === raw);
      if (titleAsSalary) return titleAsSalary.role_name;
      return raw;
    }
    return employeeRankLabel;
  }, [employeeProfile?.job_title, displayUser?.role, employeeRankLabel, salaryRoles]);

  // Update breadcrumb label when user data is available
  useEffect(() => {
    if (displayUser?.full_name) {
      setDynamicLabel(location.pathname, displayUser.full_name);
    }
  }, [displayUser?.full_name, location.pathname, setDynamicLabel]);

  // Initialize preview avatar when modal opens
  useEffect(() => {
    if (isAvatarModalOpen) {
      setPreviewAvatar(avatar || null);
    }
  }, [isAvatarModalOpen, avatar]);

  // Close modal when clicking escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsAvatarModalOpen(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  if (isLoading) return <div className="p-8"><LoadingSkeleton rows={10} /></div>;

  // Close modal when clicking outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      setIsAvatarModalOpen(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveAvatar = async () => {
    if (!selectedFile) {
      setIsAvatarModalOpen(false);
      return;
    }

    try {
      setIsUploading(true);
      const res = await uploadApi.uploadFile(selectedFile, 'avatars', 'profiles');
      if (res?.url) {
        await authApi.updateProfile({ avatar_url: res.url });
        updateUser({ avatar_url: res.url });
        toast.success('Cập nhật ảnh đại diện thành công');
        setIsAvatarModalOpen(false);
      }
    } catch (err: any) {
      toast.error('Lỗi khi tải ảnh: ' + (err.message || 'Không xác định'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveAvatar = () => {
    setPreviewAvatar(null);
  };

  const handleProfileFieldChange = (field: keyof ProfileFormState, value: string) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
  };

  const formatGender = (gender?: string | null) => {
    if (gender === 'male') return 'Nam';
    if (gender === 'female') return 'Nữ';
    if (gender === 'other') return 'Khác';
    return 'Chưa cập nhật';
  };

  const handleSaveProfile = async () => {
    if (!canEditProfile || isCustomer) return;

    if (!profileForm.full_name.trim()) {
      toast.error('Họ và tên không được để trống');
      return;
    }

    try {
      setIsSavingProfile(true);
      const profilePayload = {
        full_name: profileForm.full_name.trim(),
        phone: profileForm.phone.trim() || null,
        date_of_birth: profileForm.date_of_birth || null,
        gender: profileForm.gender || null,
        citizen_id: profileForm.citizen_id.trim() || null,
        job_title: profileForm.job_title.trim() || null,
        department: profileForm.department.trim() || null,
        personal_email: profileForm.personal_email.trim() || null,
        emergency_contact_name: profileForm.emergency_contact_name.trim() || null,
        emergency_contact_phone: profileForm.emergency_contact_phone.trim() || null,
        emergency_contact_relationship: profileForm.emergency_contact_relationship.trim() || null,
        city: profileForm.city.trim() || null,
        district: profileForm.district.trim() || null,
        ward: profileForm.ward.trim() || null,
        address_line: profileForm.address_line.trim() || null,
        temporary_address: profileForm.temporary_address.trim() || null,
      };

      if (isCurrentUser) {
        await authApi.updateProfile(profilePayload);
      } else {
        await updateEmployeeProfile({
          id: targetId,
          payload: {
            ...profilePayload,
            role: canEditEmployeeRank
              ? salaryRankKeyDraft || (displayUser?.role as string) || 'staff'
              : (displayUser?.role as string) || 'staff',
          },
        });
      }

      if (isCurrentUser) {
        updateUser({ full_name: profileForm.full_name.trim() });
      }
      await refetchEmployee();
      await refetchCustomer();
      setIsEditingProfile(false);
      toast.success('Cập nhật hồ sơ thành công');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || 'Không thể cập nhật hồ sơ');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const resetPasswordForm = () => {
    setPasswordOld('');
    setPasswordNew('');
    setPasswordConfirm('');
  };

  const handleTogglePasswordChange = () => {
    setShowPasswordChange((open) => {
      if (open) resetPasswordForm();
      return !open;
    });
  };

  const handleCancelPasswordChange = () => {
    resetPasswordForm();
    setShowPasswordChange(false);
  };

  const handleSavePassword = async () => {
    if (passwordNew.length < 6) {
      toast.error('Mật khẩu mới tối thiểu 6 ký tự');
      return;
    }
    if (passwordNew !== passwordConfirm) {
      toast.error('Xác nhận mật khẩu mới không khớp');
      return;
    }
    try {
      setIsSavingPassword(true);
      const adminSetsEmployeePassword = isAdmin && !isCurrentUser && !isCustomer && targetId;
      if (adminSetsEmployeePassword) {
        await authApi.changePassword({ userId: targetId, newPassword: passwordNew });
        toast.success('Đã đặt mật khẩu mới cho nhân viên');
      } else {
        await authApi.changePassword({
          currentPassword: passwordOld,
          newPassword: passwordNew,
        });
        toast.success('Đổi mật khẩu thành công');
      }
      handleCancelPasswordChange();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || 'Không thể đổi mật khẩu');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleCancelEditProfile = () => {
    if (isCustomer || !employeeProfile) return;
    setProfileForm({
      full_name: displayUser?.full_name || '',
      phone: employeeProfile?.phone || '',
      date_of_birth: toDateInput(employeeProfile?.date_of_birth),
      gender: (employeeProfile?.gender as ProfileFormState['gender']) || '',
      citizen_id: employeeProfile?.citizen_id || '',
      job_title: employeeProfile?.job_title || '',
      department: employeeProfile?.department || '',
      personal_email: employeeProfile?.personal_email || '',
      emergency_contact_name: employeeProfile?.emergency_contact_name || '',
      emergency_contact_phone: employeeProfile?.emergency_contact_phone || '',
      emergency_contact_relationship: employeeProfile?.emergency_contact_relationship || '',
      city: employeeProfile?.city || '',
      district: employeeProfile?.district || '',
      ward: employeeProfile?.ward || '',
      address_line: employeeProfile?.address_line || '',
      temporary_address: employeeProfile?.temporary_address || '',
    });
    if (canEditEmployeeRank) {
      setSalaryRankKeyDraft(String(employeeProfile?.role || 'staff'));
    }
    setIsEditingProfile(false);
  };

  return (
    <>
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full pb-10 space-y-4 -mt-2">
        {/* Header */}
        <div className="flex items-center gap-4 mb-1">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm border border-primary/20">
            <User size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Hồ sơ cá nhân</h1>
            <p className="text-muted-foreground text-xs">Quản lý thông tin tài khoản và cài đặt của bạn.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column - Sidebar Profile (Sticky) */}
          <div className="lg:col-span-3">
            <div className="sticky top-0 self-start space-y-6">
              <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
                <div className="h-20 bg-gradient-to-r from-primary/20 to-primary/5" />
                <div className="px-6 pb-6 -mt-10 flex flex-col items-center">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-full border-4 border-card bg-primary/10 flex items-center justify-center text-3xl font-bold text-primary overflow-hidden shadow-md">
                      <img loading="lazy" decoding="async"
                        src={cloudinaryThumb(displayAvatar)}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute bottom-0 right-0 w-6 h-6 bg-emerald-500 rounded-full border-2 border-card shadow-sm" />
                  </div>

                  <div className="mt-4 text-center">
                    <h2 className="text-xl font-bold text-foreground">{displayUser?.full_name}</h2>
                    <div className="inline-flex items-center px-2.5 py-0.5 mt-1 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">
                      {employeeRankLabel}
                    </div>
                  </div>

                  <div className="w-full mt-8 space-y-4">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <Mail size={16} className="text-primary/60 shrink-0" />
                      <span className="truncate">{displayUser?.email || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <Phone size={16} className="text-primary/60 shrink-0" />
                      <span>{profileData?.phone || 'Chưa cập nhật'}</span>
                    </div>
                    {!isCustomer && (
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <User size={16} className="text-primary/60 shrink-0" />
                        <span>{employeeRankLabel}</span>
                      </div>
                    )}
                    {isCustomer && (
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <MapPin size={16} className="text-primary/60 shrink-0" />
                        <span className="truncate">{(profileData as any)?.address || 'Chưa cập nhật'}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <Calendar size={16} className="text-primary/60 shrink-0" />
                      <span>Tham gia {displayUser ? new Date((displayUser as any).created_at).toLocaleDateString() : '--/--/----'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-emerald-500 font-medium">
                      <ShieldCheck size={16} className="shrink-0" />
                      <span>Tài khoản xác thực</span>
                    </div>
                  </div>

                  {(isCurrentUser || canEditProfile) && (
                    <div className="w-full mt-8 space-y-3">
                      <div className={clsx('grid gap-3', actionGridClass)}>
                        {showAvatarButton && (
                          <button
                            type="button"
                            onClick={() => setIsAvatarModalOpen(true)}
                            className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-muted/50 border border-border hover:bg-muted transition-colors group"
                          >
                            <div className="w-8 h-8 rounded-full bg-card flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors shadow-sm">
                              <Camera size={16} />
                            </div>
                            <span className="text-[10px] font-bold text-muted-foreground">Đổi ảnh</span>
                          </button>
                        )}
                        {showEditButton && (
                          <button
                            type="button"
                            onClick={() => {
                              if (isEditingProfile) {
                                handleSaveProfile();
                                return;
                              }
                              setIsEditingProfile(true);
                            }}
                            disabled={isSavingProfile}
                            className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-muted/50 border border-border hover:bg-muted transition-colors group"
                          >
                            <div className="w-8 h-8 rounded-full bg-card flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors shadow-sm">
                              {isSavingProfile ? <Loader2 size={16} className="animate-spin" /> : <Edit size={16} />}
                            </div>
                            <span className="text-[10px] font-bold text-muted-foreground">{isEditingProfile ? 'Lưu hồ sơ' : 'Sửa hồ sơ'}</span>
                          </button>
                        )}
                        {showPasswordButton && (
                          <button
                            type="button"
                            onClick={handleTogglePasswordChange}
                            className={clsx(
                              'flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-colors group min-w-0',
                              showPasswordChange
                                ? 'bg-primary/10 border-primary/30 text-primary'
                                : 'bg-muted/50 border-border hover:bg-muted'
                            )}
                          >
                            <div
                              className={clsx(
                                'w-8 h-8 rounded-full bg-card flex items-center justify-center shadow-sm transition-colors shrink-0',
                                showPasswordChange
                                  ? 'text-primary'
                                  : 'text-muted-foreground group-hover:text-primary'
                              )}
                            >
                              <KeyRound size={16} />
                            </div>
                            <span className="text-[10px] font-bold text-muted-foreground text-center leading-tight">Đổi mật khẩu</span>
                          </button>
                        )}
                      </div>
                      {showPasswordButton && showPasswordChange && (
                        <div className="w-full rounded-xl border border-border bg-muted/20 p-3 space-y-3 text-left">
                          {isCurrentUser && (
                            <div className="space-y-1.5">
                              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">Mật khẩu cũ</p>
                              <input
                                type="password"
                                autoComplete="current-password"
                                value={passwordOld}
                                onChange={(e) => setPasswordOld(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm"
                              />
                            </div>
                          )}
                          {!isCurrentUser && isAdmin && (
                            <p className="text-xs text-muted-foreground">
                              Đặt mật khẩu đăng nhập mới cho nhân viên (không cần mật khẩu cũ).
                            </p>
                          )}
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">Mật khẩu mới</p>
                            <input
                              type="password"
                              autoComplete="new-password"
                              value={passwordNew}
                              onChange={(e) => setPasswordNew(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">Xác nhận mật khẩu mới</p>
                            <input
                              type="password"
                              autoComplete="new-password"
                              value={passwordConfirm}
                              onChange={(e) => setPasswordConfirm(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm"
                            />
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={handleCancelPasswordChange}
                              disabled={isSavingPassword}
                              className="flex-1 py-2 rounded-xl border border-border text-xs font-bold hover:bg-muted disabled:opacity-50"
                            >
                              Hủy
                            </button>
                            <button
                              type="button"
                              onClick={handleSavePassword}
                              disabled={isSavingPassword}
                              className="flex-1 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {isSavingPassword ? <Loader2 size={14} className="animate-spin" /> : null}
                              Lưu mật khẩu
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Information Sections */}
          <div className="lg:col-span-9 space-y-6">
            {!isCustomer && canEditProfile && isEditingProfile && (
              <div className="bg-card rounded-2xl border border-border shadow-sm p-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Bạn đang chỉnh sửa hồ sơ. Nhấn "Lưu hồ sơ" ở sidebar hoặc nút bên phải để hoàn tất.</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCancelEditProfile}
                    className="px-4 py-2 rounded-xl border border-border text-sm font-bold hover:bg-muted"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    disabled={isSavingProfile}
                    className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 flex items-center gap-2 disabled:opacity-60"
                  >
                    {isSavingProfile ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Lưu hồ sơ
                  </button>
                </div>
              </div>
            )}

            {/* Section 1: Thông tin cá nhân */}
            <SectionContainer icon={UserCircle} title="THÔNG TIN CÁ NHÂN">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isEditingProfile && canEditProfile && !isCustomer ? (
                  <EditableInput
                    icon={User}
                    label="Họ tên"
                    value={profileForm.full_name}
                    required
                    onChange={(value) => handleProfileFieldChange('full_name', value)}
                  />
                ) : (
                  <InfoItem icon={User} label="Họ tên" value={displayUser?.full_name || '---'} />
                )}
                {isEditingProfile && canEditProfile && !isCustomer ? (
                  <EditableInput
                    icon={Mail}
                    label="Email"
                    value={profileForm.personal_email}
                    type="email"
                    onChange={(value) => handleProfileFieldChange('personal_email', value)}
                  />
                ) : (
                  <InfoItem icon={Mail} label="Email" value={employeeProfile?.personal_email || displayUser?.email || '---'} />
                )}
                <InfoItem icon={Phone} label="Điện thoại" value={profileData?.phone || 'Chưa cập nhật'} />
                {isCustomer && (
                  <InfoItem icon={MapPin} label="Địa chỉ" value={(profileData as any)?.address || 'Chưa cập nhật'} cols={2} />
                )}
                {!isCustomer && (
                  <>
                    {isEditingProfile && canEditProfile ? (
                      <EditableInput
                        icon={Calendar}
                        label="Ngày sinh"
                        value={profileForm.date_of_birth}
                        type="date"
                        onChange={(value) => handleProfileFieldChange('date_of_birth', value)}
                      />
                    ) : (
                      <InfoItem icon={Calendar} label="Ngày sinh" value={employeeProfile?.date_of_birth ? new Date(employeeProfile.date_of_birth).toLocaleDateString() : 'Chưa cập nhật'} />
                    )}
                    {isEditingProfile && canEditProfile ? (
                      <EditableSelect
                        icon={Fingerprint}
                        label="Giới tính"
                        value={profileForm.gender}
                        options={[
                          { value: '', label: 'Chưa cập nhật' },
                          { value: 'male', label: 'Nam' },
                          { value: 'female', label: 'Nữ' },
                          { value: 'other', label: 'Khác' },
                        ]}
                        onChange={(value) => handleProfileFieldChange('gender', value)}
                      />
                    ) : (
                      <InfoItem icon={Fingerprint} label="Giới tính" value={formatGender(employeeProfile?.gender)} />
                    )}
                    {isEditingProfile && canEditProfile ? (
                      <EditableInput
                        icon={IdCard}
                        label="CMND/CCCD"
                        value={profileForm.citizen_id}
                        onChange={(value) => handleProfileFieldChange('citizen_id', value)}
                      />
                    ) : (
                      <InfoItem icon={IdCard} label="CMND/CCCD" value={employeeProfile?.citizen_id || 'Chưa cập nhật'} />
                    )}
                  </>
                )}
              </div>
            </SectionContainer>

            {/* Section 2: Thông tin công việc */}
            {isCustomer ? (
              <SectionContainer icon={WalletIcon} title="THÔNG TIN CHI TIÊU">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <InfoItem icon={WalletIcon} label="Tổng đơn hàng" value={((profileData as any)?.total_orders || 0).toString()} highlight />
                  <InfoItem icon={Landmark} label="Tổng doanh thu" value={((profileData as any)?.total_revenue || 0).toLocaleString() + ' đ'} highlight />
                  <InfoItem icon={Shield} label="Công nợ hiện tại" value={((profileData as any)?.debt || 0).toLocaleString() + ' đ'} highlight />
                </div>
              </SectionContainer>
            ) : (
              <SectionContainer icon={BriefcaseIcon} title="THÔNG TIN CÔNG VIỆC">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <InfoItem icon={Fingerprint} label="Mã nhân viên" value={displayUser?.id?.substring(0, 5).toUpperCase() || '---'} highlight />
                  {isEditingProfile && canEditProfile ? (
                    <EditableInput
                      icon={Briefcase}
                      label="Chức vụ"
                      value={profileForm.job_title}
                      onChange={(value) => handleProfileFieldChange('job_title', value)}
                    />
                  ) : (
                    <InfoItem icon={Briefcase} label="Chức vụ" value={jobTitleDisplay} highlight />
                  )}
                  {isEditingProfile && canEditProfile ? (
                    <EditableInput
                      icon={Briefcase}
                      label="Phòng ban"
                      value={profileForm.department}
                      onChange={(value) => handleProfileFieldChange('department', value)}
                    />
                  ) : (
                    <InfoItem icon={Briefcase} label="Phòng ban" value={employeeProfile?.department || 'Chưa cập nhật'} highlight />
                  )}
                  {canEditEmployeeRank && isEditingProfile && canEditProfile ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-muted-foreground/70">
                        <User size={12} strokeWidth={2} />
                        <p className="text-[11px] font-bold uppercase tracking-wider">Cấp bậc</p>
                      </div>
                      <SearchableSelect
                        options={salaryRankSelectOptions}
                        value={salaryRankKeyDraft}
                        onValueChange={setSalaryRankKeyDraft}
                        placeholder="Chọn cấp bậc"
                        searchPlaceholder="Tìm cấp bậc..."
                        emptyMessage="Không tìm thấy cấp bậc."
                      />
                    </div>
                  ) : (
                    <InfoItem icon={User} label="Cấp bậc" value={employeeRankLabel} />
                  )}
                  <InfoItem icon={Calendar} label="Ngày vào làm" value={employeeProfile?.created_at ? new Date(employeeProfile.created_at).toLocaleDateString() : '--/--/----'} />
                </div>
              </SectionContainer>
            )}

            {/* Section 3: Thông tin liên hệ */}
            <SectionContainer icon={Mail} title="THÔNG TIN LIÊN HỆ">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isEditingProfile && canEditProfile && !isCustomer ? (
                  <EditableInput
                    icon={User}
                    label="Người liên hệ khẩn cấp"
                    value={profileForm.emergency_contact_name}
                    onChange={(value) => handleProfileFieldChange('emergency_contact_name', value)}
                  />
                ) : (
                  <InfoItem icon={User} label="Người liên hệ khẩn cấp" value={employeeProfile?.emergency_contact_name || 'Chưa cập nhật'} />
                )}
                {isEditingProfile && canEditProfile && !isCustomer ? (
                  <EditableInput
                    icon={Phone}
                    label="SĐT khẩn cấp"
                    value={profileForm.emergency_contact_phone}
                    onChange={(value) => handleProfileFieldChange('emergency_contact_phone', value)}
                  />
                ) : (
                  <InfoItem icon={Phone} label="SĐT khẩn cấp" value={employeeProfile?.emergency_contact_phone || 'Chưa cập nhật'} />
                )}
                {isEditingProfile && canEditProfile && !isCustomer ? (
                  <EditableInput
                    icon={Heart}
                    label="Quan hệ"
                    value={profileForm.emergency_contact_relationship}
                    onChange={(value) => handleProfileFieldChange('emergency_contact_relationship', value)}
                  />
                ) : (
                  <InfoItem icon={Heart} label="Quan hệ" value={employeeProfile?.emergency_contact_relationship || 'Chưa cập nhật'} />
                )}
              </div>

              <div className="mt-8 pt-8 border-t border-border/50">
                <div className="flex items-center gap-2 mb-6">
                  <MapPinIcon size={16} className="text-primary" />
                  <h4 className="text-[12px] font-bold text-foreground">ĐỊA CHỈ</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {isEditingProfile && canEditProfile && !isCustomer ? (
                    <EditableInput
                      icon={MapPin}
                      label="Tỉnh/Thành phố"
                      value={profileForm.city}
                      onChange={(value) => handleProfileFieldChange('city', value)}
                    />
                  ) : (
                    <InfoItem icon={MapPin} label="Tỉnh/Thành phố" value={employeeProfile?.city || 'Chưa cập nhật'} />
                  )}
                  {isEditingProfile && canEditProfile && !isCustomer ? (
                    <EditableInput
                      icon={MapPin}
                      label="Quận/Huyện"
                      value={profileForm.district}
                      onChange={(value) => handleProfileFieldChange('district', value)}
                    />
                  ) : (
                    <InfoItem icon={MapPin} label="Quận/Huyện" value={employeeProfile?.district || 'Chưa cập nhật'} />
                  )}
                  {isEditingProfile && canEditProfile && !isCustomer ? (
                    <EditableInput
                      icon={MapPin}
                      label="Phường/Xã"
                      value={profileForm.ward}
                      onChange={(value) => handleProfileFieldChange('ward', value)}
                    />
                  ) : (
                    <InfoItem icon={MapPin} label="Phường/Xã" value={employeeProfile?.ward || 'Chưa cập nhật'} />
                  )}
                  {isEditingProfile && canEditProfile && !isCustomer ? (
                    <EditableInput
                      icon={MapPin}
                      label="Địa chỉ chi tiết"
                      value={profileForm.address_line}
                      onChange={(value) => handleProfileFieldChange('address_line', value)}
                    />
                  ) : (
                    <InfoItem icon={MapPin} label="Địa chỉ chi tiết" value={employeeProfile?.address_line || 'Chưa cập nhật'} />
                  )}
                  {isEditingProfile && canEditProfile && !isCustomer ? (
                    <EditableInput
                      icon={MapPin}
                      label="Địa chỉ tạm trú"
                      value={profileForm.temporary_address}
                      cols={2}
                      onChange={(value) => handleProfileFieldChange('temporary_address', value)}
                    />
                  ) : (
                    <InfoItem icon={MapPin} label="Địa chỉ tạm trú" value={employeeProfile?.temporary_address || 'Chưa cập nhật'} cols={2} />
                  )}
                </div>
              </div>
            </SectionContainer>

            {/* Section 4: Hôn nhân & Học vấn
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <SectionContainer icon={HeartIcon} title="HÔN NHÂN & GIA ĐÌNH">
                <div className="grid grid-cols-1 gap-6">
                  <InfoItem icon={Heart} label="Tình trạng hôn nhân" value="Chưa cập nhật" />
                  <InfoItem icon={Users} label="Số người phụ thuộc" value="Chưa cập nhật" />
                </div>
              </SectionContainer>

              <SectionContainer icon={GraduationCapIcon} title="HỌC VẤN & CHỨNG CHỈ">
                <div className="grid grid-cols-1 gap-6">
                  <InfoItem icon={GraduationCap} label="Trình độ học vấn" value="Chưa cập nhật" />
                  <InfoItem icon={Briefcase} label="Chuyên ngành" value="Chưa cập nhật" />
                  <InfoItem icon={Landmark} label="Trường đào tạo" value="Chưa cập nhật" />
                  <InfoItem icon={Calendar} label="Năm tốt nghiệp" value="Chưa cập nhật" />
                  <InfoItem icon={Shield} label="Chứng chỉ bổ sung" value="Chưa cập nhật" />
                </div>
              </SectionContainer>
            </div> */}

            {/* Section 5: Tài chính & Bảo hiểm
            <SectionContainer icon={WalletIcon} title="TÀI CHÍNH & NGÂN HÀNG">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <InfoItem icon={Landmark} label="Số tài khoản" value="Chưa cập nhật" />
                <InfoItem icon={Landmark} label="Ngân hàng" value="Chưa cập nhật" />
                <InfoItem icon={MapPin} label="Chi nhánh" value="Chưa cập nhật" />
                <InfoItem icon={Fingerprint} label="Mã số thuế cá nhân" value="Chưa cập nhật" />
              </div>

              <div className="mt-8 pt-8 border-t border-border/50">
                <div className="flex items-center gap-2 mb-6">
                  <ShieldCheckIcon size={16} className="text-primary" />
                  <h4 className="text-[12px] font-bold text-foreground">BẢO HIỂM</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <InfoItem icon={Shield} label="Số BHXH" value="Chưa cập nhật" />
                  <InfoItem icon={Shield} label="Số BHYT" value="Chưa cập nhật" />
                  <InfoItem icon={Calendar} label="Ngày tham gia BH" value="Chưa cập nhật" />
                  <InfoItem icon={MapPin} label="Nơi đăng ký KCB" value="Chưa cập nhật" />
                </div>
              </div>
            </SectionContainer> */}

            {/* Section 6: Thông tin hệ thống */}
            <SectionContainer icon={Info} title="THÔNG TIN HỆ THỐNG">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <InfoItem icon={Calendar} label="Ngày tạo" value={employeeProfile?.created_at ? new Date(employeeProfile.created_at).toLocaleDateString() : '---'} />
                <InfoItem icon={User} label="Người tạo" value="system" />
                <InfoItem icon={Calendar} label="Cập nhật lần cuối" value={employeeProfile?.updated_at ? new Date(employeeProfile.updated_at).toLocaleDateString() : (employeeProfile?.created_at ? new Date(employeeProfile.created_at).toLocaleDateString() : '---')} />
              </div>
            </SectionContainer>
          </div>
        </div>
      </div>

      {/* Change Avatar Modal - Moved outside to ensure fixed positioning relative to viewport */}
      {isAvatarModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={handleBackdropClick}
        >
          <div
            ref={modalRef}
            className="bg-card w-full max-w-md rounded-3xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
              <h3 className="text-base font-bold text-foreground">Đổi ảnh đại diện</h3>
              <button
                onClick={() => setIsAvatarModalOpen(false)}
                className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-8 flex flex-col items-center space-y-8">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/*"
              />
              <div className="relative">
                <div className="w-48 h-48 rounded-full border-4 border-card bg-primary/10 flex items-center justify-center text-6xl font-bold text-primary overflow-hidden shadow-inner">
                  <img loading="lazy" decoding="async"
                    src={cloudinaryThumb(previewAvatar || defaultAvatar)}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/5 pointer-events-none" />
                </div>
              </div>

              <div className="flex items-center gap-6">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 text-primary hover:underline transition-all text-sm font-bold"
                >
                  <Edit size={16} />
                  <span>Đổi ảnh</span>
                </button>
                <div className="w-[1px] h-4 bg-border" />
                <button
                  onClick={handleRemoveAvatar}
                  className="flex items-center gap-2 text-red-500 hover:underline transition-all text-sm font-bold"
                >
                  <Trash2 size={16} />
                  <span>Xóa ảnh</span>
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-border bg-muted/30 flex items-center justify-end gap-3">
              <button
                onClick={() => setIsAvatarModalOpen(false)}
                className="px-6 py-2 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted border border-border transition-all"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveAvatar}
                disabled={isUploading}
                className="px-8 py-2 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isUploading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                <span>{isUploading ? 'Đang tải...' : 'Lưu'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// UI Components
const SectionContainer: React.FC<{ icon: React.ElementType, title: string, children: React.ReactNode }> = ({ icon: Icon, title, children }) => (
  <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
    <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center gap-3">
      <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
        <Icon size={16} />
      </div>
      <h3 className="text-[13px] font-bold text-foreground tracking-tight">{title}</h3>
    </div>
    <div className="p-6">
      {children}
    </div>
  </div>
);

const InfoItem: React.FC<{
  icon: React.ElementType,
  label: string,
  value: string,
  highlight?: boolean,
  badge?: string,
  cols?: number
}> = ({ icon: Icon, label, value, highlight, badge, cols = 1 }) => (
  <div className={clsx("space-y-1.5", cols === 2 && "md:col-span-2")}>
    <div className="flex items-center gap-1.5 text-muted-foreground/70">
      <Icon size={12} strokeWidth={2} />
      <p className="text-[11px] font-bold uppercase tracking-wider">{label}</p>
    </div>
    <div className="flex items-center gap-2">
      <span className={clsx(
        "text-[14px]",
        highlight ? "font-bold text-foreground" : (value === "Chưa cập nhật" ? "text-muted-foreground/40 italic" : "font-medium text-foreground")
      )}>
        {value}
      </span>
      {badge && (
        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold border border-primary/20">
          {badge}
        </span>
      )}
    </div>
  </div>
);

const EditableInput: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: 'text' | 'email' | 'date';
  cols?: number;
}> = ({ icon: Icon, label, value, onChange, required, type = 'text', cols = 1 }) => (
  <div className={clsx('space-y-1.5', cols === 2 && 'md:col-span-2')}>
    <div className="flex items-center gap-1.5 text-muted-foreground/70">
      <Icon size={12} strokeWidth={2} />
      <p className="text-[11px] font-bold uppercase tracking-wider">
        {label} {required && <span className="text-red-500">*</span>}
      </p>
    </div>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm"
    />
  </div>
);

const EditableSelect: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}> = ({ icon: Icon, label, value, options, onChange }) => (
  <div className="space-y-1.5">
    <div className="flex items-center gap-1.5 text-muted-foreground/70">
      <Icon size={12} strokeWidth={2} />
      <p className="text-[11px] font-bold uppercase tracking-wider">{label}</p>
    </div>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm"
    >
      {options.map((option) => (
        <option key={option.value || 'empty'} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
);

export default ProfilePage;

