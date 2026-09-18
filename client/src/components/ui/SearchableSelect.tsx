import * as React from "react"
import { Check, ChevronDown, X } from "lucide-react"

import { cn } from "../../lib/utils"
import { removeAccents } from "../../lib/str-utils"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover"

interface Option {
  value: string
  label: string
  selectedLabel?: string
  /** Extra text included in search matching but not displayed (e.g. aliases). */
  searchText?: string
  content?: React.ReactNode
}

interface SearchableSelectProps {
  options: Option[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  className?: string
  disabled?: boolean
  allowCustom?: boolean
  icon?: React.ReactNode
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Chọn...",
  searchPlaceholder = "Tìm kiếm...",
  emptyMessage = "Không có kết quả.",
  className,
  disabled = false,
  allowCustom = false,
  icon,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState("")

  const selectedOption = options.find((option) => option.value === value) || (allowCustom && value ? { value, label: value } : undefined)

  return (
    <Popover open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) setSearchValue("");
    }}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-xl border border-border/80 bg-muted/10 px-4 py-2 text-[13px] font-medium transition-all hover:bg-muted/20 focus:outline-none focus:ring-2 focus:ring-primary/10",
            open && "border-primary ring-2 ring-primary/5",
            !selectedOption && "text-muted-foreground/60",
            className
          )}
        >
          <div className="flex items-center gap-2 overflow-hidden">
            {icon && <span className="text-muted-foreground/60 shrink-0">{icon}</span>}
            <span className="truncate">
              {selectedOption ? (selectedOption.selectedLabel || selectedOption.label) : placeholder}
            </span>
          </div>
          <div className="flex items-center gap-1.5 ml-2">
            {value && !disabled && (
              <X
                size={14}
                className="text-muted-foreground/40 hover:text-red-500 transition-colors cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  onValueChange("")
                }}
              />
            )}
            <ChevronDown
              size={16}
              className={cn(
                "text-muted-foreground/40 transition-transform duration-200",
                open && "rotate-180"
              )}
            />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-full min-w-[var(--radix-popover-trigger-width)] p-0 shadow-xl border-border/60">
        <Command 
          className="rounded-xl overflow-hidden"
          filter={(val, search) => {
            const normalizedValue = removeAccents(val).toLowerCase();
            const normalizedSearch = removeAccents(search).toLowerCase();
            return normalizedValue.includes(normalizedSearch) ? 1 : 0;
          }}
        >
          <CommandInput 
            placeholder={searchPlaceholder} 
            className="h-10 border-none text-[13px] focus:ring-0"
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList className="max-h-60 p-1">
            <CommandEmpty className="py-6 text-[12px] text-muted-foreground">
              {emptyMessage}
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.searchText || option.label}
                  onSelect={() => {
                    onValueChange(option.value)
                    setOpen(false)
                    setSearchValue("")
                  }}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-[13px] font-medium transition-colors hover:bg-primary/5",
                    value === option.value && "bg-primary/10 text-primary hover:bg-primary/15"
                  )}
                >
                  <span className="min-w-0 flex-1">{option.content || option.label}</span>
                  {value === option.value && (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            {allowCustom && searchValue && !options.some(opt => opt.label.toLowerCase() === searchValue.toLowerCase()) && (
              <CommandGroup>
                <CommandItem
                  value={searchValue}
                  onSelect={() => {
                    onValueChange(searchValue)
                    setOpen(false)
                    setSearchValue("")
                  }}
                  className="flex items-center gap-2 text-primary px-3 py-2 rounded-lg cursor-pointer text-[13px] font-medium transition-colors hover:bg-primary/5"
                >
                  Tạo mới "{searchValue}"
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
