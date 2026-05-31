import React from 'react';
import { clsx } from 'clsx';
import { Link } from 'react-router-dom';

import { ArrowUpRight } from 'lucide-react';

export interface ActionCardProps {
  icon?: React.ElementType;
  iconSrc?: string;
  title: string;
  description: string;
  href: string;
  colorScheme: 'red' | 'green' | 'pink' | 'blue' | 'orange' | 'teal' | 'purple' | 'cyan' | 'emerald' | 'amber' | 'slate';
  onClick?: () => void;
}

const colorMap = {
  red: 'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-md shadow-red-500/20',
  green: 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-500/20',
  pink: 'bg-gradient-to-br from-pink-500 to-pink-600 text-white shadow-md shadow-pink-500/20',
  blue: 'bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-md shadow-blue-500/20',
  orange: 'bg-gradient-to-br from-orange-500 to-orange-700 text-white shadow-lg shadow-orange-500/30',
  teal: 'bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-md shadow-teal-500/20',
  purple: 'bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-md shadow-violet-500/20',
  cyan: 'bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/20',
  emerald: 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-500/20',
  amber: 'bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/20',
  slate: 'bg-gradient-to-br from-slate-600 to-slate-700 text-white shadow-md shadow-slate-600/20',
};

export const ActionCard: React.FC<ActionCardProps> = ({
  icon: Icon,
  iconSrc,
  title,
  description,
  href,
  colorScheme,
  onClick
}) => {
  const isExternal = href.startsWith('http');
  const className = "group relative block bg-card rounded-[24px] p-6 transition-all duration-300 hover:shadow-xl border border-border hover:border-primary/20 hover:-translate-y-1";

  const innerContent = (
    <>
      {/* Hover Arrow Icon */}
      <div className="absolute top-3 right-3 w-7 h-7 bg-primary/5 rounded-full flex items-center justify-center text-primary opacity-0 -translate-x-2 translate-y-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0">
        <ArrowUpRight size={16} strokeWidth={2.5} />
      </div>

      <div className="flex flex-col items-center text-center h-full">
        {iconSrc ? (
          <img loading="lazy" decoding="async" 
            src={iconSrc} 
            alt={title} 
            className="w-16 h-16 rounded-[22px] object-cover mb-5 transition-transform duration-300 group-hover:scale-110 shadow-sm" 
          />
        ) : (
          <div 
            className={clsx(
              "w-16 h-16 rounded-[22px] flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110 shadow-sm",
              colorMap[colorScheme]
            )}
          >
            {Icon && <Icon size={30} strokeWidth={2} />}
          </div>
        )}
        
        <h3 className="font-bold text-[17px] text-foreground mb-1.5 group-hover:text-primary transition-colors">
          {title}
        </h3>
        
        <p className="text-[13px] text-muted-foreground leading-relaxed line-clamp-2 px-2">
          {description}
        </p>
      </div>
    </>
  );

  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className={className}
      >
        {innerContent}
      </a>
    );
  }

  return (
    <Link
      to={href}
      onClick={onClick}
      className={className}
    >
      {innerContent}
    </Link>
  );
};

