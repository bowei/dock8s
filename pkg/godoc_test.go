package pkg

import (
	"reflect"
	"testing"
)

func TestParseGoDocString(t *testing.T) {
	testCases := []struct {
		name     string
		input    string
		expected *GoDocString
	}{
		{
			name:  "Empty",
			input: "",
			expected: &GoDocString{
				Elements: nil,
			},
		},
		{
			name:  "Simple Paragraph",
			input: "This is a simple paragraph.",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocParagraph, Content: []string{"This is a simple paragraph."}},
				},
			},
		},
		{
			name:  "Multiple Paragraphs",
			input: "Paragraph one.\n\nParagraph two.",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocParagraph, Content: []string{"Paragraph one."}},
					{Type: GoDocParagraph, Content: []string{"Paragraph two."}},
				},
			},
		},
		{
			name:  "Markdown Heading 1",
			input: "\n# This is a heading\n",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocHeading, Content: []string{"This is a heading"}},
				},
			},
		},
		{
			name:  "Markdown Heading 4",
			input: "\n#### This is a heading\n",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocHeading, Content: []string{"This is a heading"}},
				},
			},
		},
		{
			name:  "Not heading 1",
			input: "# not a heading",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocParagraph, Content: []string{"# not a heading"}},
				},
			},
		},
		{
			name:  "Not heading 2",
			input: "\n#\n",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocParagraph, Content: []string{"#"}},
				},
			},
		},
		{
			name:  "Not heading 3",
			input: "\n#text\n",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocParagraph, Content: []string{"#text"}},
				},
			},
		},
		{
			name:  "Not heading 4",
			input: "\n# text",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocParagraph, Content: []string{"# text"}},
				},
			},
		},
		{
			name:  "Paragraph with colon",
			input: "This is a line with a colon:\nbut it's part of a paragraph.",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocParagraph, Content: []string{"This is a line with a colon: but it's part of a paragraph."}},
				},
			},
		},
		{
			name:  "Plus Directive",
			input: "+directive: Do not use.",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocDirective, Content: []string{"+directive: Do not use."}},
				},
			},
		},
		{
			name:  "Code Block",
			input: "  code line 1\n  code line 2",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocCode, Content: []string{"code line 1\ncode line 2"}},
				},
			},
		},
		{
			name:  "Code block with blank lines",
			input: "  line 1\n  \n  line 3",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocCode, Content: []string{"line 1\n\nline 3"}},
				},
			},
		},
		{
			name:  "Code block followed by paragraph",
			input: "  code\n\npara",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocCode, Content: []string{"code\n"}},
					{Type: GoDocParagraph, Content: []string{"para"}},
				},
			},
		},
		{
			name:  "Bulleted List",
			input: "* item 1\n* item 2",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocElementList, Content: []string{"item 1", "item 2"}},
				},
			},
		},
		{
			name:  "Numbered List",
			input: "1. item 1\na) item 2",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocElementList, Content: []string{"item 1", "item 2"}},
				},
			},
		},
		{
			name:  "List with multi-line items",
			input: "* item 1\n  more text for item 1\n* item 2",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocElementList, Content: []string{"item 1 more text for item 1", "item 2"}},
				},
			},
		},
		{
			// Mirrors the real-world godoc pattern from gateway-api: each bullet
			// spans multiple source lines that should be reflowed into one string.
			name: "List with wrapped lines joins into single item text",
			input: "- Core: Filter types and their corresponding configuration defined by\n" +
				"  \"Support: Core\" in this package, e.g. \"RequestHeaderModifier\". All\n" +
				"  implementations must support core filters.\n" +
				"- Extended: Filter types and their corresponding configuration defined by\n" +
				"  \"Support: Extended\" in this package, e.g. \"RequestMirror\". Implementers\n" +
				"  are encouraged to support extended filters.",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocElementList, Content: []string{
						`Core: Filter types and their corresponding configuration defined by "Support: Core" in this package, e.g. "RequestHeaderModifier". All implementations must support core filters.`,
						`Extended: Filter types and their corresponding configuration defined by "Support: Extended" in this package, e.g. "RequestMirror". Implementers are encouraged to support extended filters.`,
					}},
				},
			},
		},
		{
			// Blank line between items: items merge into one list.
			name:  "List with blank line between items",
			input: "* item 1\n\n* item 2",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocElementList, Content: []string{"item 1", "item 2"}},
				},
			},
		},
		{
			// Indented text after list with only a blank separator is absorbed into
			// the last item — a code block cannot appear immediately after a list.
			name:  "Mixed Content",
			input: "This is a paragraph.\n\n# A Heading\n\n* list item 1\n* list item 2\n\n  code block\n\nAnother paragraph.",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocParagraph, Content: []string{"This is a paragraph."}},
					{Type: GoDocHeading, Content: []string{"A Heading"}},
					{Type: GoDocElementList, Content: []string{"list item 1", "list item 2\n\ncode block"}},
					{Type: GoDocParagraph, Content: []string{"Another paragraph."}},
				},
			},
		},
		{
			// Blank line inside a list item creates a paragraph break within that item.
			name:  "List item with paragraph break",
			input: "* First paragraph of item one.\n  \n  Second paragraph of item one.\n\n* Item two.",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocElementList, Content: []string{"First paragraph of item one.\n\nSecond paragraph of item one.", "Item two."}},
				},
			},
		},
		{
			// A blank line followed by indented text is absorbed even after multiple
			// blank lines — the list ends only when the next non-blank is not indented.
			name:  "List item absorbs continuation after bare blank",
			input: "* item one\n* item two\n  \n  item two continued.\n\n  still item two.\n \nNot a list item.",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocElementList, Content: []string{"item one", "item two\n\nitem two continued.\n\nstill item two."}},
					{Type: GoDocParagraph, Content: []string{"Not a list item."}},
				},
			},
		},
		{
			// A non-indented paragraph ("clear end") between the list and indented
			// text resets context so the indented text is a code block.
			name:  "Code block after clear end of list",
			input: "* item one\n* item two\n\nClear end of list.\n\n  This is a code block.",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocElementList, Content: []string{"item one", "item two"}},
					{Type: GoDocParagraph, Content: []string{"Clear end of list."}},
					{Type: GoDocCode, Content: []string{"This is a code block."}},
				},
			},
		},
		{
			name:  "Fenced code block basic",
			input: "```\nline one\nline two\n```",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocCode, Content: []string{"line one\nline two"}},
				},
			},
		},
		{
			name:  "Fenced code block with language specifier",
			input: "```go\nfunc Foo() {}\n```",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocCode, Content: []string{"func Foo() {}"}},
				},
			},
		},
		{
			name:  "Fenced code block preserves blank lines inside",
			input: "```\nfirst\n\nsecond\n```",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocCode, Content: []string{"first\n\nsecond"}},
				},
			},
		},
		{
			name:  "Fenced code block unclosed reaches end of input",
			input: "```\nonly line",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocCode, Content: []string{"only line"}},
				},
			},
		},
		{
			name:  "Fenced code block in mixed content",
			input: "Intro paragraph.\n\n```\ncode here\n```\n\nTrailing paragraph.",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocParagraph, Content: []string{"Intro paragraph."}},
					{Type: GoDocCode, Content: []string{"code here"}},
					{Type: GoDocParagraph, Content: []string{"Trailing paragraph."}},
				},
			},
		},
		{
			// Paragraph immediately followed by a directive (no blank line) — exercises
			// the "+" break inside parseParagraph.
			name:  "Paragraph then directive no blank line",
			input: "some text\n+directive: note",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocParagraph, Content: []string{"some text"}},
					{Type: GoDocDirective, Content: []string{"+directive: note"}},
				},
			},
		},
		{
			// A line that looks like a heading but is NOT bracketed by blank lines on
			// both sides — exercises the before/after empty check in isHeading.
			name:  "Not heading - no blank before",
			input: "before\n# heading\n",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocParagraph, Content: []string{"before # heading"}},
				},
			},
		},
		{
			// "#" line bracketed by blank before but non-blank after — exercises
			// the before/after empty check in isHeading (after is not empty → false).
			name:  "Not heading - no blank after",
			input: "\n# heading\nafter text",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocParagraph, Content: []string{"# heading after text"}},
				},
			},
		},
		{
			// "e.g. " at the start of a line must not be treated as a list marker.
			name:  "Abbreviation e.g. is not a list item",
			input: "e.g. a string value",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocParagraph, Content: []string{"e.g. a string value"}},
				},
			},
		},
		{
			// "etc. " at the start of a line must not be treated as a list marker.
			// "etc." would match the numbered-list pattern ("etc" + "." + " ") without
			// the abbreviation guard.
			name:  "Abbreviation etc. is not a list item",
			input: "etc. other values are also valid",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocParagraph, Content: []string{"etc. other values are also valid"}},
				},
			},
		},
		{
			// "i.e. " at the start of a line must not be treated as a list marker.
			name:  "Abbreviation i.e. is not a list item",
			input: "i.e. the canonical form",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocParagraph, Content: []string{"i.e. the canonical form"}},
				},
			},
		},
		{
			// "e.g." appearing mid-sentence inside a list-item continuation must
			// still be folded into the list item, not break it.
			name: "Abbreviation mid-sentence in list continuation",
			input: "- Use a short identifier,\n" +
				"  e.g. \"foo\" or \"bar\".",
			expected: &GoDocString{
				Elements: []GoDocElem{
					{Type: GoDocElementList, Content: []string{`Use a short identifier, e.g. "foo" or "bar".`}},
				},
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			act := parseGoDocString(tc.input)
			if !reflect.DeepEqual(act, tc.expected) {
				t.Errorf("parseGoDocString() = %+v, want %+v", act, tc.expected)
			}
		})
	}
}

func TestDocParserPeek_EOF(t *testing.T) {
	// Call peek() with pos beyond end of lines to cover the return "" branch.
	p := &docParser{lines: []string{"a"}, pos: 5}
	got := p.peek()
	if got != "" {
		t.Errorf("peek() at EOF: got %q, want %q", got, "")
	}
}
