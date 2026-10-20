// Package redact 对输出中的 Agent Token 明文做统一脱敏。
package redact

import "regexp"

var tokenPattern = regexp.MustCompile(`lin_agent_[A-Za-z0-9_\-]+`)

// Redact 把文本中的 Agent Token 明文替换为 lin_agent_***。
func Redact(text string) string {
	return tokenPattern.ReplaceAllString(text, "lin_agent_***")
}
