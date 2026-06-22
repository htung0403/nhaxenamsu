import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../../context/AuthContext';
import { User, Lock, ArrowRight, AlertCircle, EyeOff, Eye } from 'lucide-react';
import { clsx } from 'clsx';

const loginSchema = z.object({
  phone: z.string().min(1, 'Vui lòng nhập số điện thoại'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
  rememberMe: z.boolean().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      rememberMe: false,
    }
  });

  useEffect(() => {
    const savedPhone = localStorage.getItem('remember_phone');
    if (savedPhone) {
      setValue('phone', savedPhone, { shouldValidate: true });
      setValue('rememberMe', true);
    }
  }, [setValue]);

  useEffect(() => {
    const reason = new URLSearchParams(location.search).get('reason');
    if (reason === 'time-locked') {
      setServerError('Ngoài khung giờ truy cập hệ thống');
    }
  }, [location.search]);

  const onSubmit = async (data: LoginFormData) => {
    setIsSubmitting(true);
    setServerError('');
    try {
      if (data.rememberMe) {
        localStorage.setItem('remember_phone', data.phone);
      } else {
        localStorage.removeItem('remember_phone');
      }

      await login(data.phone.trim(), data.password);
      navigate('/app', { replace: true });
    } catch (err: any) {
      setServerError(err?.response?.data?.message || err?.message || 'Đăng nhập thất bại. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-v-background text-v-on-surface font-body min-h-screen flex flex-col">
      <main className="flex-grow flex items-center justify-center py-8 px-6">
        <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-12 bg-v-surface-container-lowest rounded-xl overflow-hidden shadow-gentle border border-v-outline-variant/30">
          {/* Left Side: Visual Inspiration */}
          <div className="hidden lg:block lg:col-span-7 relative overflow-hidden bg-v-surface-variant">
            <img loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" alt="Fresh organic microgreens" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDMb7jAwrhSbIuXw-isr77u29Lw7jN0ACfso5NL272nVhtSOolXyGfEEqhmvEocwVdfCzeF1alYAZS8XtjIqxvZtuycaAbUj-SnVJrHO9yaFDSdeAoDREqmTu9WrG4DG5Dg6u8_V2D-l1-DRz5ZYArZYNgJgKiP6-_LF0cglPhaBSnid-KtSwCDC72chQJFI87Rdss8IrdsLK7AKreaVR0aNqbQShOH8YmhsrWM5op4xO_45ZW9W6neR5_q_2OmKnuf5lTOa1cK" />
            <div className="absolute bottom-12 left-12 right-12 z-10">
              <div className="bg-white/70 backdrop-blur-xl p-10 rounded-3xl max-w-md shadow-sm border border-white/50">
                <span className="inline-block px-4 py-1.5 bg-v-primary-container text-v-on-primary-container text-xs font-bold rounded-full mb-5 uppercase tracking-wider">SẠCH & TƯƠI MỚI</span>
                <h2 className="font-headline text-3xl font-bold text-v-on-primary-container leading-tight mb-4">Mang cả khu vườn vào gian bếp của bạn</h2>
                <p className="text-v-on-surface-variant text-sm leading-relaxed">Hành trình từ nông trại hữu cơ đến bàn ăn gia đình bạn, đảm bảo tiêu chuẩn Global GAP và niềm đam mê với nông nghiệp bền vững.</p>
              </div>
            </div>
          </div>

          {/* Right Side: Login Form */}
          <div className="col-span-1 lg:col-span-5 p-10 md:p-14 flex flex-col justify-center bg-white/50">
            <div className="mb-10 text-center lg:text-left">
              <h1 className="font-headline text-4xl font-extrabold text-v-on-background tracking-tight mb-3">Chào mừng trở lại</h1>
              <p className="text-v-on-surface-variant">Đăng nhập để làm việc</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {serverError && (
                <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 text-red-600 px-4 py-3 rounded-xl text-[13px] font-medium">
                  <AlertCircle size={18} className="shrink-0" />
                  {serverError}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-v-on-surface ml-1">Số điện thoại</label>
                <div className="relative">
                  <User size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-v-outline" />
                  <input
                    {...register('phone')}
                    className={clsx(
                      "w-full pl-12 pr-4 py-4 bg-v-surface-container-low border-none rounded-[1.25rem] focus:ring-2 focus:ring-v-primary/30 transition-all text-v-on-surface placeholder:text-v-outline/60 outline-none",
                      errors.phone && "ring-2 ring-red-500/50"
                    )}
                    placeholder="VD: 0901234567"
                    type="text"
                  />
                </div>
                {errors.phone && (
                  <p className="text-red-500 text-[12px] font-medium ml-1">{errors.phone.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <label className="block text-sm font-semibold text-v-on-surface">Mật khẩu</label>
                  <a className="text-xs font-semibold text-v-primary-dim hover:text-v-primary transition-colors" href="#">Quên mật khẩu?</a>
                </div>
                <div className="relative">
                  <Lock size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-v-outline" />
                  <input
                    {...register('password')}
                    className={clsx(
                      "w-full pl-12 pr-12 py-4 bg-v-surface-container-low border-none rounded-[1.25rem] focus:ring-2 focus:ring-v-primary/30 transition-all text-v-on-surface placeholder:text-v-outline/60 outline-none",
                      errors.password && "ring-2 ring-red-500/50"
                    )}
                    placeholder="••••••••"
                    type={showPassword ? 'text' : 'password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-v-outline hover:text-v-on-surface transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-red-500 text-[12px] font-medium ml-1">{errors.password.message}</p>
                )}
              </div>

              <div className="flex items-center gap-2 px-1 pb-1">
                <input
                  {...register('rememberMe')}
                  className="w-4 h-4 rounded border-v-outline-variant text-v-primary focus:ring-v-primary/20 accent-v-primary"
                  id="remember"
                  type="checkbox"
                />
                <label className="text-sm text-v-on-surface-variant cursor-pointer" htmlFor="remember">Ghi nhớ đăng nhập</label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={clsx(
                  "w-full py-4 text-v-on-primary font-bold rounded-full shadow-md transition-all flex items-center justify-center gap-2",
                  isSubmitting ? "bg-v-surface-variant text-v-on-surface-variant cursor-not-allowed" : "pastel-gradient hover:shadow-lg hover:brightness-105 active:scale-[0.98]"
                )}
              >
                {isSubmitting ? (
                  <>
                    <span className="w-5 h-5 border-2 border-v-on-primary/30 border-t-v-on-primary rounded-full animate-spin" />
                    Đang xử lý...
                  </>
                ) : (
                  <>
                    Đăng nhập
                    <ArrowRight size={20} />
                  </>
                )}
              </button>
            </form>
          </div>

        </div>
      </main>
    </div>
  );
};

export default LoginPage;

