import React, { useState, useEffect, useRef, useCallback } from 'react';

interface TypewriterTextProps {
  texts: string[];
  typingSpeed?: number;      // 打字速度 (毫秒/字符)
  deletingSpeed?: number;    // 删除速度 (毫秒/字符)
  pauseDuration?: number;    // 停顿时间 (毫秒)
  className?: string;
  textClassName?: string;
  prefixClassName?: string;  // 前缀(FUND)的样式
  suffixClassName?: string;  // 后缀(MATRIX等)的样式
  preservePrefix?: string;   // 保留不删除的前缀
}

export const TypewriterText: React.FC<TypewriterTextProps> = ({
  texts,
  typingSpeed = 100,
  deletingSpeed = 50,
  pauseDuration = 1500,
  className = '',
  textClassName = '',
  prefixClassName = 'text-foreground',
  suffixClassName = 'text-red-500',
  preservePrefix = ''
}) => {
  const [displayText, setDisplayText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [charIndex, setCharIndex] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 清理定时器
  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // 渲染带前缀/后缀样式的文本
  const renderTextWithStyles = (text: string) => {
    if (!preservePrefix || !text.startsWith(preservePrefix)) {
      return <span className={textClassName}>{text}</span>;
    }

    const prefix = preservePrefix;
    const suffix = text.substring(prefix.length);
    
    return (
      <>
        <span className={prefixClassName}>{prefix}</span>
        {suffix && <span className={suffixClassName}>{suffix}</span>}
      </>
    );
  };

  // 打字逻辑
  useEffect(() => {
    if (texts.length === 0) return;

    const currentText = texts[currentIndex];
    
    // 如果正在删除
    if (isDeleting) {
      if (charIndex > preservePrefix.length) {
        // 继续删除（但保留前缀）
        timeoutRef.current = setTimeout(() => {
          setDisplayText(currentText.substring(0, charIndex - 1));
          setCharIndex(prev => prev - 1);
        }, deletingSpeed);
      } else {
        // 删除完成（保留前缀），切换到下一个文本
        setIsDeleting(false);
        setCurrentIndex((prev) => (prev + 1) % texts.length);
        setDisplayText(preservePrefix); // 重置为前缀
        setCharIndex(preservePrefix.length);
      }
    } 
    // 如果正在打字
    else {
      if (charIndex < currentText.length) {
        // 继续打字
        timeoutRef.current = setTimeout(() => {
          setDisplayText(currentText.substring(0, charIndex + 1));
          setCharIndex(prev => prev + 1);
        }, typingSpeed);
      } else {
        // 打字完成，暂停后开始删除
        timeoutRef.current = setTimeout(() => {
          setIsDeleting(true);
        }, pauseDuration);
      }
    }

    return clearTimer;
  }, [charIndex, currentIndex, isDeleting, texts, typingSpeed, deletingSpeed, pauseDuration, clearTimer, preservePrefix]);

  // 组件卸载时清理
  useEffect(() => {
    return clearTimer;
  }, [clearTimer]);

  return (
    <div className={`relative inline-flex items-center tracking-tight ${className}`}>
      {renderTextWithStyles(displayText)}
      <span className="ml-0.5 w-1.5 h-8 bg-accent inline-block animate-pulse align-middle"></span>
    </div>
  );
};

export default TypewriterText;

