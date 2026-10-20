package redact

import "testing"

func TestRedactMasksAgentTokens(t *testing.T) {
	cases := []struct{ in, want string }{
		{"认证失败 token=lin_agent_abcd1234_SecretValue2026 请检查", "认证失败 token=lin_agent_*** 请检查"},
		{"无敏感内容", "无敏感内容"},
		{"lin_agent_ab12cd34_x 和 lin_agent_zz998877_y 两个", "lin_agent_*** 和 lin_agent_*** 两个"},
	}
	for _, c := range cases {
		if got := Redact(c.in); got != c.want {
			t.Errorf("Redact(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
