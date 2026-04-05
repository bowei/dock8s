package dock8s

import "embed"

//go:embed web/index.html
//go:embed web/app.js web/column.js web/search.js web/hash.js web/utils.js web/godoc.js
//go:embed web/theme-*.css
var WebFS embed.FS
