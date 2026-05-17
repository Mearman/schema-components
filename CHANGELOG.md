## [1.16.2](https://github.com/Mearman/schema-components/compare/v1.16.1...v1.16.2) (2026-05-17)

### Bug Fixes

* **docs:** sync MUI/Mantine/Radix/shadcn previews with theme toggle ([eae6d50](https://github.com/Mearman/schema-components/commit/eae6d5044632dda3b339faf8f782c760ffae8cda))

## [1.16.1](https://github.com/Mearman/schema-components/compare/v1.16.0...v1.16.1) (2026-05-17)

### Chores

* add pre-push hook running pnpm audit ([f5b6347](https://github.com/Mearman/schema-components/commit/f5b634759f1cb87dc40729782b5df62cc7296b41))

## [1.16.0](https://github.com/Mearman/schema-components/compare/v1.15.1...v1.16.0) (2026-05-17)

### Features

* **html:** theme HTML default styles via CSS custom properties ([e724e5c](https://github.com/Mearman/schema-components/commit/e724e5c00aa41e5e8d8192b6a2c639dd8b770f97))

### Bug Fixes

* **docs:** comprehensive dark-mode theming for storybook docs ([65d6c15](https://github.com/Mearman/schema-components/commit/65d6c15a273a2955329d51c908e520a78206b50e))

## [1.15.1](https://github.com/Mearman/schema-components/compare/v1.15.0...v1.15.1) (2026-05-17)

### Bug Fixes

* **react:** decode em-dash and ellipsis escapes in JSX text ([77f7ea1](https://github.com/Mearman/schema-components/commit/77f7ea1c7ccebc4a51ba3b6c382d03e09a07ca59))

## [1.15.0](https://github.com/Mearman/schema-components/compare/v1.14.0...v1.15.0) (2026-05-16)

### Features

* **docs:** add MdxMermaid helper for rendering diagrams in MDX pages ([6c0bfa9](https://github.com/Mearman/schema-components/commit/6c0bfa9dc8895b1938d38be70ad3169e3f3d8af1))
* **docs:** tag stories, expose argTypes, and cross-link related demos ([12a6d37](https://github.com/Mearman/schema-components/commit/12a6d37d5317abadc72002d955811ca9566927b9))

### Bug Fixes

* **docs:** import HtmlResolver from core/renderer ([cdc863f](https://github.com/Mearman/schema-components/commit/cdc863f3b1678c24bfa81821a9f8c5e5b126bf7d))
* **docs:** theme MDX content and argstable in dark mode ([fee2822](https://github.com/Mearman/schema-components/commit/fee2822d3b6172570676a0daa819c5fa6de5af88))

### Documentation

* **docs:** add Getting Started MDX page ([df3e643](https://github.com/Mearman/schema-components/commit/df3e6430878649b8b11eac8d3818a499177d956a))
* **docs:** add How it works MDX page ([0f2f77e](https://github.com/Mearman/schema-components/commit/0f2f77e4d6c11a60f2b8b8176b6d102c79d955b6))
* **html:** add HTML Rendering overview MDX page ([e06b54d](https://github.com/Mearman/schema-components/commit/e06b54d5f5a980beb19bedccdb2e81839db9b599))
* **openapi:** add OpenAPI walkthrough MDX page ([7936869](https://github.com/Mearman/schema-components/commit/79368691456a42a12e1074ccf3f4e18b89408b24))
* **themes:** add Theme Adapters overview MDX page ([ae486f3](https://github.com/Mearman/schema-components/commit/ae486f3ba5fa103789f4e6661b0fa7199db08c4d))

### Tests

* **docs:** add play functions, argTypes, and tags to interactive stories ([618dcdd](https://github.com/Mearman/schema-components/commit/618dcdd4806689cb83f8f60168dfb1d41f216727))

### Chores

* **docs:** add @storybook/addon-links ([45434fd](https://github.com/Mearman/schema-components/commit/45434fd3be948c0840a7d0328411e7f24585d63c))
* **docs:** include mdx files in stories glob ([f9fb4bc](https://github.com/Mearman/schema-components/commit/f9fb4bc22038447cb5882e3722bc7be2593e7fd4))

## [1.14.0](https://github.com/Mearman/schema-components/compare/v1.13.0...v1.14.0) (2026-05-16)

### Features

* **core:** add cycle marker for type-level $ref recursion ([b8d5408](https://github.com/Mearman/schema-components/commit/b8d54087b961e1abfc1c064ff8027c5a53e9e950))
* **core:** add diagnostics channel for surfacing silent fallbacks ([25d6c21](https://github.com/Mearman/schema-components/commit/25d6c215821857bc4fac28be1044ccb889f81c7a))
* **core:** add standard JSON Schema format patterns and validators ([ce071df](https://github.com/Mearman/schema-components/commit/ce071dfe0657a9074ee8f2c43b289af41ecf68cc))
* **core:** handle boolean schemas (true/false) at sub-schema positions ([9752fc8](https://github.com/Mearman/schema-components/commit/9752fc875b44532efd4eceef482063cd99a48ea5))
* **core:** infer JSON Schema draft from keywords when $schema absent ([53aac44](https://github.com/Mearman/schema-components/commit/53aac443b83bb1e64f61e1838958850c91257eff))
* **core:** map JSON Schema format to validation constraints ([53c8869](https://github.com/Mearman/schema-components/commit/53c8869d099d0983a69a96b78f84395bbe10ba73))
* **core:** merge annotation siblings of $ref per Draft 2020-12 ([b852db6](https://github.com/Mearman/schema-components/commit/b852db61c3ff1ed8295f3d0c16f0e855b044058d))
* **core:** split legacy dependencies into dependentRequired/Schemas ([24d80b1](https://github.com/Mearman/schema-components/commit/24d80b1b0b38f0d1a499bb118310518f3c994277))
* **core:** walk contentSchema for content-encoded string fields ([d4e635b](https://github.com/Mearman/schema-components/commit/d4e635b3544d09bda7430d8782c4797e7ea8b268))
* **core:** wire ExternalResolver through walker for inline external $ref ([8a0b8a5](https://github.com/Mearman/schema-components/commit/8a0b8a543522e7e1731f3e3fe223d0a60eb806b2))
* **openapi:** add multi-document $ref resolution via bundleOpenApiDoc ([47b0cd1](https://github.com/Mearman/schema-components/commit/47b0cd114b1a37d3427be6c202a093d58edd0510))
* **openapi:** render parsed-but-ignored security, callbacks, links, and headers ([3376ba8](https://github.com/Mearman/schema-components/commit/3376ba87e69792e4c4e075282500744ae2fc3f3d))

### Bug Fixes

* **openapi:** route OAS 3.0 documents through Draft 04 normalisation ([3dc87e1](https://github.com/Mearman/schema-components/commit/3dc87e1b801141a6498dccfdb1ec25935d67c126))
* resolve pre-existing type errors blocking pnpm check ([a6e5593](https://github.com/Mearman/schema-components/commit/a6e5593861629c3104557d26ceab244dfc53d20a))

### Refactoring

* **core:** derive $ref depth bound from document instead of literal ([fed94e4](https://github.com/Mearman/schema-components/commit/fed94e41e3e913f91ceb0c08af9bd0db4b2712d6))

### Documentation

* improve Zod 3 error message and document version requirement ([b8c30d0](https://github.com/Mearman/schema-components/commit/b8c30d054e9bd8cb6ee09da626d9b8b9b774fbb9))
* update spec-support tables to match verified compliance ([738448e](https://github.com/Mearman/schema-components/commit/738448efe117bc432283161dc03446a5855a88f6))

### Tests

* **core:** add inline conformance harness for JSON Schema drafts 04–2020-12 ([0a51eb2](https://github.com/Mearman/schema-components/commit/0a51eb2c821e760a0c6da5a4a8a4dd357f6df50e))
* **openapi:** cover parameter field overrides and meta merging ([58e59a7](https://github.com/Mearman/schema-components/commit/58e59a75e5c5d2d009576a0b0b739bc8f39970e7))
* **openapi:** walk real-world OpenAPI documents end-to-end ([b522fc5](https://github.com/Mearman/schema-components/commit/b522fc5420e6c56d9384740389f8fa0347f66027))

## [1.13.0](https://github.com/Mearman/schema-components/compare/v1.12.11...v1.13.0) (2026-05-16)

### Features

* **core:** add full JSON Schema keyword support with discriminated WalkedField types ([1a8fd3d](https://github.com/Mearman/schema-components/commit/1a8fd3df84c89b5ca4ad602ab4280c1b6faa4f64))
* **core:** add JSON Schema draft and OpenAPI version detection ([3861649](https://github.com/Mearman/schema-components/commit/386164978fdb4dbf40a93da47b14ecfd2d217b18))
* **core:** extract exclusiveMinimum/exclusiveMaximum constraints ([3d0063b](https://github.com/Mearman/schema-components/commit/3d0063bc8af402dbb63116312df2c4441a53106e))
* **core:** full type inference for all JSON Schema and OpenAPI versions ([c8c353e](https://github.com/Mearman/schema-components/commit/c8c353ec4998edbb682d94c22ea87b822f4953f5))
* **core:** full type inference for all JSON Schema keywords and OpenAPI versions ([eab2b59](https://github.com/Mearman/schema-components/commit/eab2b590fba8eb8249b89586227e9a5f978cfb65))
* **core:** normalise legacy JSON Schema and OpenAPI to Draft 2020-12 ([383b3ea](https://github.com/Mearman/schema-components/commit/383b3ea29f3b00f63721cb972b3bb365d442317f))
* **core:** type inference for additionalProperties, dependentSchemas, security types ([d80d5da](https://github.com/Mearman/schema-components/commit/d80d5dadbbe2cb31b431722816f6656e884822eb))
* **core:** walk patternProperties, dependentSchemas, dependentRequired, and unevaluatedProperties ([4c42f25](https://github.com/Mearman/schema-components/commit/4c42f252b36ef9b8e1f891c07153663d9a46353b))
* **core:** walk propertyNames, unevaluatedItems, and surface examples ([d46608d](https://github.com/Mearman/schema-components/commit/d46608dbcc9000fbe4d96a9cbe964f6df39b77d1))
* **openapi:** parse callbacks, links, externalDocs, and XML ([11a2fac](https://github.com/Mearman/schema-components/commit/11a2facc5c874acfd28ea83af1536276a4a5fcfb))
* **openapi:** parse security schemes, response headers, and webhooks ([51a3413](https://github.com/Mearman/schema-components/commit/51a34134a4fd94ed74f0a386825e867cd0800168))
* **openapi:** resolve pathItem $ref and webhook accessors ([7d6bfaa](https://github.com/Mearman/schema-components/commit/7d6bfaaa32c8535d748a81213ac6756227afe083))

### Bug Fixes

* **core:** prevent infinite recursion on circular schema references ([0afe155](https://github.com/Mearman/schema-components/commit/0afe155c58f4f5fe3b5b35be3b42bb034792fe09))
* **openapi:** rewrite $ref strings during Swagger 2.0 normalisation ([114fea4](https://github.com/Mearman/schema-components/commit/114fea424c6af7d7a9502fac1069572750f2c6f1))
* **openapi:** support JSON Pointer refs and rewrite Swagger 2.0 ref prefixes ([f67ae1a](https://github.com/Mearman/schema-components/commit/f67ae1a8df0b01fa4f7d8b4ae270db711fb6a643))

### Refactoring

* **core:** extract type-level inference into typeInference.ts ([a753fc4](https://github.com/Mearman/schema-components/commit/a753fc4de4cff62097095ccbfe0b774fc592e46d))
* **core:** extract walker building blocks into walkBuilders.ts ([0286cc0](https://github.com/Mearman/schema-components/commit/0286cc0112293fe570491dd902b6d203087f1114))
* **core:** split large modules into focused files ([d35a4bd](https://github.com/Mearman/schema-components/commit/d35a4bdd8a6d6bdfda91c00079a7ad7b54106fb9))
* **core:** split large test files under 800-line threshold ([9e6247f](https://github.com/Mearman/schema-components/commit/9e6247ff001c6f16e1546dbf05da88597d246388))
* **core:** split type-inference tests into focused modules ([39c88d2](https://github.com/Mearman/schema-components/commit/39c88d222a142aa340920888d39ead7ad698289a))

### Documentation

* add Draft 06 and Webhooks stories ([ddaafef](https://github.com/Mearman/schema-components/commit/ddaafefb72863abc3ee12e5da3c24bf6b320f066))
* add stories for all JSON Schema and OpenAPI features ([319c611](https://github.com/Mearman/schema-components/commit/319c611ea55ab8d5f89eee39276ebd93a353f5ba))
* **core:** add spec support keyword matrix and type-level fallback table ([0155059](https://github.com/Mearman/schema-components/commit/0155059ac9e50ceaeae5632ec234dc3cafbeb1f3))
* render mermaid diagrams in README story ([28612fd](https://github.com/Mearman/schema-components/commit/28612fde5bc8d078fbbb5adfa42f88406e5d427c))
* stories for advanced constraints, callbacks, links, examples ([6ab858c](https://github.com/Mearman/schema-components/commit/6ab858cc3f6ae50c768edd1221cfc981a454658e))

### Tests

* **core:** add extended draft-compat and full-compliance test suites ([9aa1004](https://github.com/Mearman/schema-components/commit/9aa100477c23275b4739336900a9e379b59c3004))
* **core:** circular $ref resolution — self-referencing, mutual, and depth limit ([e073cd1](https://github.com/Mearman/schema-components/commit/e073cd1bf3ef7c9a7af355a0735723e8b6a04acf))
* **core:** compile-time and runtime tests for all inference and walker gaps ([10a8c27](https://github.com/Mearman/schema-components/commit/10a8c27990d6ad837198128f4c262d6169a56ba9))
* **core:** comprehensive coverage for openapi30, parser, and type guards ([719576e](https://github.com/Mearman/schema-components/commit/719576e7455a980e1548acbe0cf63c386def9609))

### Chores

* add no-re-exports ESLint rule ([589176b](https://github.com/Mearman/schema-components/commit/589176b6063a88a1147688d117300ac5d1ffbcaa))

## [1.12.11](https://github.com/Mearman/schema-components/compare/v1.12.10...v1.12.11) (2026-05-15)

### Documentation

* replace ASCII diagrams in README with mermaid flowchart and remove directory tree ([dad43f3](https://github.com/Mearman/schema-components/commit/dad43f323d97a13d41e0554eb5d4fbe3b4508074))

## [1.12.10](https://github.com/Mearman/schema-components/compare/v1.12.9...v1.12.10) (2026-05-15)

### Bug Fixes

* respect system colour-scheme preference on initial load ([7e414ef](https://github.com/Mearman/schema-components/commit/7e414ef01f19e9f199882bb2ee484ea2a6272296))

## [1.12.9](https://github.com/Mearman/schema-components/compare/v1.12.8...v1.12.9) (2026-05-15)

### Bug Fixes

* detect system colour-scheme preference for Storybook theme ([255403a](https://github.com/Mearman/schema-components/commit/255403a1d9f9961f13677a1aa833e84f0c774923))

## [1.12.8](https://github.com/Mearman/schema-components/compare/v1.12.7...v1.12.8) (2026-05-15)

### Bug Fixes

* **docs:** resolve nested fieldset overflow and alignment issues ([4e25c73](https://github.com/Mearman/schema-components/commit/4e25c73d688ffd5785830a1786b9978b151fbb0e))

## [1.12.7](https://github.com/Mearman/schema-components/compare/v1.12.6...v1.12.7) (2026-05-15)

### Bug Fixes

* **core:** suppress empty Children in editable mode too ([5a5a3c3](https://github.com/Mearman/schema-components/commit/5a5a3c3a4c99ff586d2c6d2790a87793d3551351))

### Documentation

* split root and core READMEs ([2ebd3c7](https://github.com/Mearman/schema-components/commit/2ebd3c745bfd0d7d0bab49e3ff4a17a8d9a14a7e))

## [1.12.6](https://github.com/Mearman/schema-components/compare/v1.12.5...v1.12.6) (2026-05-15)

### Bug Fixes

* **core:** propagate resolver null returns through renderField ([e670437](https://github.com/Mearman/schema-components/commit/e6704379b6505211541cdaf51e434366b38aa281))

## [1.12.5](https://github.com/Mearman/schema-components/compare/v1.12.4...v1.12.5) (2026-05-15)

### Bug Fixes

* **core:** suppress empty Children sections on leaf nodes ([5f0bb25](https://github.com/Mearman/schema-components/commit/5f0bb25ffe10ec9a2c97db8ebefd534fc9536a20))

## [1.12.4](https://github.com/Mearman/schema-components/compare/v1.12.3...v1.12.4) (2026-05-15)

### Bug Fixes

* **core:** use ref cache for proper recursive schema cycles ([7d49f6e](https://github.com/Mearman/schema-components/commit/7d49f6e1a7c37fdc6ea1436b2ed3998b431d304e))

## [1.12.3](https://github.com/Mearman/schema-components/compare/v1.12.2...v1.12.3) (2026-05-15)

### Bug Fixes

* deduplicate README landing page to docs-only ([71d63c7](https://github.com/Mearman/schema-components/commit/71d63c73e154e46245a54edd1c605ba0995fc1b1))

## [1.12.2](https://github.com/Mearman/schema-components/compare/v1.12.1...v1.12.2) (2026-05-15)

### Bug Fixes

* **core:** resolve recursive $ref '#' to root document ([9ea6448](https://github.com/Mearman/schema-components/commit/9ea644815e3a10acc40569acf47de71d9eae712f))
* override Storybook autodocs backgrounds for dark theme ([f39aafd](https://github.com/Mearman/schema-components/commit/f39aafd802d6b3cdac7b3bfb5ea93bfb27903fd0))

## [1.12.1](https://github.com/Mearman/schema-components/compare/v1.12.0...v1.12.1) (2026-05-15)

### Bug Fixes

* add initialGlobals to seed theme state on docs page load ([d2c4911](https://github.com/Mearman/schema-components/commit/d2c49110fee949203ec6f923e123e15cbffe84f5))

## [1.12.0](https://github.com/Mearman/schema-components/compare/v1.11.0...v1.12.0) (2026-05-15)

### Features

* theme-aware docs background via @storybook/addon-themes ([4d2a5d8](https://github.com/Mearman/schema-components/commit/4d2a5d86c9f8e760abf3eab9b23ce65e0b8723eb))

## [1.11.0](https://github.com/Mearman/schema-components/compare/v1.10.10...v1.11.0) (2026-05-15)

### Features

* theme-aware docs with CSS custom properties and dark mode support ([8c02593](https://github.com/Mearman/schema-components/commit/8c02593720e0d9c2f467a894539d0acff43f5c34))

## [1.10.10](https://github.com/Mearman/schema-components/compare/v1.10.9...v1.10.10) (2026-05-15)

### Bug Fixes

* enable autodocs for all stories and fix blank docs page ([9a99323](https://github.com/Mearman/schema-components/commit/9a9932355ded92d038530833efad7286f9eabf55))

## [1.10.9](https://github.com/Mearman/schema-components/compare/v1.10.8...v1.10.9) (2026-05-15)

### Documentation

* show brand names in repo badges ([a8ae5a3](https://github.com/Mearman/schema-components/commit/a8ae5a36b19173c2d9386cda70766e60d79f3918))

## [1.10.8](https://github.com/Mearman/schema-components/compare/v1.10.7...v1.10.8) (2026-05-15)

### Documentation

* use logo-only GitHub and Storybook badges ([4808816](https://github.com/Mearman/schema-components/commit/48088169da213eb96091a1e79fd5ffd22d5bccb8))

## [1.10.7](https://github.com/Mearman/schema-components/compare/v1.10.6...v1.10.7) (2026-05-15)

### Documentation

* add GitHub repo badge ([7f470c6](https://github.com/Mearman/schema-components/commit/7f470c68b927b325eeeabd5b285f4d34f92d27bf))

## [1.10.6](https://github.com/Mearman/schema-components/compare/v1.10.5...v1.10.6) (2026-05-15)

### Documentation

* add Storybook badge ([f7fdfdd](https://github.com/Mearman/schema-components/commit/f7fdfdd4896971ee6a2c493edb8abaea7cee451b))

## [1.10.5](https://github.com/Mearman/schema-components/compare/v1.10.4...v1.10.5) (2026-05-15)

### Documentation

* add npm, license, and CI badges to README ([e9bef58](https://github.com/Mearman/schema-components/commit/e9bef58ef75822775b266da6e1e57596aa0de971))
* consolidate README — single source of truth via symlink ([3da376f](https://github.com/Mearman/schema-components/commit/3da376f2a47d9e52dc68000ebd7471a6e723ba63))

## [1.10.4](https://github.com/Mearman/schema-components/compare/v1.10.3...v1.10.4) (2026-05-15)

### Documentation

* add README landing page with syntax-highlighted code blocks ([a28addd](https://github.com/Mearman/schema-components/commit/a28addd9639412b9aa9c1d1a9efd86bfbaab4430))
* make README the Storybook landing page ([644bebc](https://github.com/Mearman/schema-components/commit/644bebced1dbc89fcc56cdaca7b211ce8f46f605))

## [1.10.3](https://github.com/Mearman/schema-components/compare/v1.10.2...v1.10.3) (2026-05-15)

### Documentation

* add README landing page and autodocs to Storybook ([dbab5ce](https://github.com/Mearman/schema-components/commit/dbab5ce2d3ccacd26793df125ae3d62dc301c00c))

## [1.10.2](https://github.com/Mearman/schema-components/compare/v1.10.1...v1.10.2) (2026-05-15)

### Bug Fixes

* **react:** render records in headless resolver ([d661106](https://github.com/Mearman/schema-components/commit/d6611065059ee08434e76cbbf7ae1881f48da74a))

### Documentation

* enable autodocs for all stories ([f8064e9](https://github.com/Mearman/schema-components/commit/f8064e9cbc99c5ce4d7bda8c592d36056465c486))

## [1.10.1](https://github.com/Mearman/schema-components/compare/v1.10.0...v1.10.1) (2026-05-15)

### Documentation

* restructure Storybook and add completeness demos ([8562562](https://github.com/Mearman/schema-components/commit/8562562e3b823c2f92daf386a0e90123e97edd2f))

## [1.10.0](https://github.com/Mearman/schema-components/compare/v1.9.1...v1.10.0) (2026-05-15)

### Features

* **core:** add Radix Themes adapter and Storybook demos ([749510f](https://github.com/Mearman/schema-components/commit/749510f28f0bc97b02dea775a975573777fd12c3))

## [1.9.1](https://github.com/Mearman/schema-components/compare/v1.9.0...v1.9.1) (2026-05-15)

### Bug Fixes

* **core:** replace component boundary suppressions with ElementType slots ([856d100](https://github.com/Mearman/schema-components/commit/856d100072b9506f2466fc7f295ddc1f54ecc3ed))

## [1.9.0](https://github.com/Mearman/schema-components/compare/v1.8.1...v1.9.0) (2026-05-15)

### Features

* **core:** add Mantine theme adapter and wire up real component libraries ([296608a](https://github.com/Mearman/schema-components/commit/296608a38c8102de7c88354988299a1808bc7d7a))

### Bug Fixes

* **core:** handle forwardRef objects in toComponent for real component libraries ([0275fc8](https://github.com/Mearman/schema-components/commit/0275fc8891006d1b0fe0ae8602a1c88ba363e45e))

## [1.8.1](https://github.com/Mearman/schema-components/compare/v1.8.0...v1.8.1) (2026-05-15)

### Bug Fixes

* **ci:** build core before storybook tests and fix static dir path ([1afd005](https://github.com/Mearman/schema-components/commit/1afd0051f4e7f598d4ed2073c4024c1a1afad6cf))
* **ci:** debug playwright browser path in Docker container ([b55b828](https://github.com/Mearman/schema-components/commit/b55b828018d18c1ed895bad7f1157473e54c9b42))
* **ci:** remove debug steps from storybook tests ([b3ef3e2](https://github.com/Mearman/schema-components/commit/b3ef3e2da0ef284c4dd5f002c0e4f75c1c445e14))
* **ci:** set PLAYWRIGHT_BROWSERS_PATH at step level for storybook tests ([c8d4bb6](https://github.com/Mearman/schema-components/commit/c8d4bb6841e7fc425cabd4d82c175446beb130e7))
* **ci:** set PLAYWRIGHT_BROWSERS_PATH for Docker container ([8ae43ef](https://github.com/Mearman/schema-components/commit/8ae43ef4d9933ee98052618bcc50f661f9327080))
* **ci:** use native playwright install instead of Docker container ([0de3948](https://github.com/Mearman/schema-components/commit/0de39487a3b4c177f4052bf647d6bfd20364e3c3))

### Refactoring

* convert to pnpm monorepo with packages/core and packages/docs ([3fd58c3](https://github.com/Mearman/schema-components/commit/3fd58c39da525995d0dea0786e1f3ec3cc20982d))

### Chores

* remove stale root tsdown and vitest configs ([86adf7b](https://github.com/Mearman/schema-components/commit/86adf7b15587d031054159395538e66272797b52))
* sync core package version to 1.8.0 ([315d302](https://github.com/Mearman/schema-components/commit/315d302905fab0dfe589f8d965759e1a39ab87b1))

## [1.8.0](https://github.com/Mearman/schema-components/compare/v1.7.1...v1.8.0) (2026-05-14)

### Features

* **build:** add headless renderer preview styles for storybook ([460536e](https://github.com/Mearman/schema-components/commit/460536e390e682121c3124e4ee338c953942634e))

## [1.7.1](https://github.com/Mearman/schema-components/compare/v1.7.0...v1.7.1) (2026-05-14)

### Documentation

* update README and add Storybook stories for visibility, ordering, and per-field validation ([4be4b6f](https://github.com/Mearman/schema-components/commit/4be4b6feaaa4819937280c010eacb3f36a521a54))

## [1.7.0](https://github.com/Mearman/schema-components/compare/v1.6.0...v1.7.0) (2026-05-14)

### Features

* add field visibility and ordering controls ([27cb3e1](https://github.com/Mearman/schema-components/commit/27cb3e19ba930200116c79293078fa6fa2743723))

## [1.6.0](https://github.com/Mearman/schema-components/compare/v1.5.1...v1.6.0) (2026-05-14)

### Features

* add per-field onValidationError and writeOnly tests ([bc65589](https://github.com/Mearman/schema-components/commit/bc655893601b8e015dd3c717eccc9bf9dffbbb42))

### Tests

* add writeOnly behaviour tests across all renderers ([abfb293](https://github.com/Mearman/schema-components/commit/abfb293498efc4d4095dec072fd1e5a9c3239035))

## [1.5.1](https://github.com/Mearman/schema-components/compare/v1.5.0...v1.5.1) (2026-05-14)

### Bug Fixes

* blank writeOnly values in boolean and number renderers ([b46ecac](https://github.com/Mearman/schema-components/commit/b46ecac8d997fd4b875d6090d5374cded1143e5d))

## [1.5.0](https://github.com/Mearman/schema-components/compare/v1.4.0...v1.5.0) (2026-05-14)

### Features

* add storybook stories for widgets, SchemaView, defaults, editability, and records ([e36720e](https://github.com/Mearman/schema-components/commit/e36720e09edcba11374eca77394f000a62261309))

## [1.4.0](https://github.com/Mearman/schema-components/compare/v1.3.3...v1.4.0) (2026-05-14)

### Features

* add scoped widget resolution at instance, context, and global levels ([b330baf](https://github.com/Mearman/schema-components/commit/b330baf183d00bebf999108f16c9dabd40c243be))

### Documentation

* update README with scoped widget resolution documentation ([21ac50d](https://github.com/Mearman/schema-components/commit/21ac50dc9a55144fc319fcf482ffad6a16585a27))

## [1.3.3](https://github.com/Mearman/schema-components/compare/v1.3.2...v1.3.3) (2026-05-14)

### Refactoring

* extract pure resolution layer from openapi components ([5e0ab32](https://github.com/Mearman/schema-components/commit/5e0ab32de44b41b23e74082886a5ae881b418883))

### Tests

* add guards unit tests ([39f53ab](https://github.com/Mearman/schema-components/commit/39f53abf4cf30f1751a09267f34990c4a2532567))
* add openapi resolution and component unit tests ([75a5892](https://github.com/Mearman/schema-components/commit/75a589220f05b5649a531bec946a63093e824687))
* add renderer utility unit tests ([3ca3677](https://github.com/Mearman/schema-components/commit/3ca367709acf6324a33a79adf3799528971defc2))
* expand html and streaming coverage, tighten vitest config ([ac480cd](https://github.com/Mearman/schema-components/commit/ac480cdeb39cf2ae0fa3107de2abae39102cfa26))

## [1.3.2](https://github.com/Mearman/schema-components/compare/v1.3.1...v1.3.2) (2026-05-14)

### Refactoring

* migrate all tests from node:test to vitest ([457ff24](https://github.com/Mearman/schema-components/commit/457ff24ab667330848d3ddf8b578211dbfc31f34))

## [1.3.1](https://github.com/Mearman/schema-components/compare/v1.3.0...v1.3.1) (2026-05-14)

### CI

* add storybook component test job ([4441151](https://github.com/Mearman/schema-components/commit/4441151b9d2ac7255f8116235a9793440841d462))

## [1.3.0](https://github.com/Mearman/schema-components/compare/v1.2.0...v1.3.0) (2026-05-14)

### Features

* add storybook testing with vitest addon, a11y, and browser mode ([e32944e](https://github.com/Mearman/schema-components/commit/e32944edf2f54b04d50bcf93ffc678e77d5615e4))

### Bug Fixes

* strip children from mui stub void elements ([49de9c6](https://github.com/Mearman/schema-components/commit/49de9c6f48cdc30c37fbdcfad561b95e74e7db7b))

### Chores

* exclude errors stories from component tests ([7b04129](https://github.com/Mearman/schema-components/commit/7b04129f9e3a58edecfd65560dba5b6ba7ffbd76))

## [1.2.0](https://github.com/Mearman/schema-components/compare/v1.1.0...v1.2.0) (2026-05-14)

### Features

* add date/time and discriminated union stories ([595c559](https://github.com/Mearman/schema-components/commit/595c559c98beab7fdf28790513597bfce8c773cd))
* comprehensive accessibility improvements ([ed11b2e](https://github.com/Mearman/schema-components/commit/ed11b2e7c408960a94c27d65f0869836720e179c))
* discriminated union UI, date/time inputs, schema defaults ([5cde96e](https://github.com/Mearman/schema-components/commit/5cde96e77e6af642b4973cc84b0aff129813318f))
* file upload renderer ([3742384](https://github.com/Mearman/schema-components/commit/37423849d045e9e044667d1206336207b7c60f05))
* mui theme adapter and coverage enforcement ([adeb0b6](https://github.com/Mearman/schema-components/commit/adeb0b6bab3ee2c34fe78d26db10f5d082396cc6))
* ssr tests and server component (SchemaView) ([7268f09](https://github.com/Mearman/schema-components/commit/7268f0918981030b55005678168cb3726c75dd74))

### Bug Fixes

* exclude ssr e2e test from tsconfig ([f9248cd](https://github.com/Mearman/schema-components/commit/f9248cd32c809992873153e268c77b26d4b3f1a1))

### Refactoring

* rename ssr test from integration to e2e ([b373e3a](https://github.com/Mearman/schema-components/commit/b373e3aa8842906ce4a53259b640eaad9f410fb6))

### Documentation

* add discriminated unions, date/time, defaults to README ([91bc96c](https://github.com/Mearman/schema-components/commit/91bc96c7700c81c8c903f2ba9e1a6ced4e4b5c83))

### CI

* add ssr e2e step and separate test script ([e023d8b](https://github.com/Mearman/schema-components/commit/e023d8bddb2f34d88059a74cab05ef391f4957b8))

### Chores

* downgrade storybook 10.4.0 to 10.3.6 and vite 8.0.12 to 8.0.11 ([e3f8341](https://github.com/Mearman/schema-components/commit/e3f83419cea890517d69fda8ea0a3ef3ba8fb619))
* update dependencies (tsdown 0.22.0) ([1fc7dc0](https://github.com/Mearman/schema-components/commit/1fc7dc05f91fdabd98317684eb8bce49136c3c32))

## [1.1.0](https://github.com/Mearman/schema-components/compare/v1.0.0...v1.1.0) (2026-05-14)

### Features

* add validation, recursive, and OpenAPI operation stories ([d1b742e](https://github.com/Mearman/schema-components/commit/d1b742e58e57e7c11ce36a7a868e1efc2574a04b))
* expand Storybook coverage with JSON Schema, streaming, and error stories ([4378701](https://github.com/Mearman/schema-components/commit/4378701b29bcd1ebec5b8caf46bdd452d4b0f766))

## 1.0.0 (2026-05-14)

### Features

* add accessibility attributes to HTML renderers ([ea49b72](https://github.com/Mearman/schema-components/commit/ea49b7264b3dd496afba851d6bcee6a103e688fb))
* add default stylesheet for sc- prefixed HTML classes ([44d1a91](https://github.com/Mearman/schema-components/commit/44d1a91ce9f986567552070f6d698d3f3d78f7b1))
* add html renderer — render schemas to raw html strings ([a803cfb](https://github.com/Mearman/schema-components/commit/a803cfb4fb8a881115dc224abe15cb4325844fbb))
* add renderChild to RenderProps for theme adapter recursion ([24305a2](https://github.com/Mearman/schema-components/commit/24305a2793d80d7a29384ba5fda2c46861479952))
* add shadcn adapter, schema caching, and update readme/package ([fff4082](https://github.com/Mearman/schema-components/commit/fff40825bdb6e3820010dd7faa48a307549af7c9))
* add Storybook with GitHub Pages deployment ([eae9817](https://github.com/Mearman/schema-components/commit/eae98178e565fa10ba1c2f258887fafb08cafd37))
* add streaming HTML renderer with three output formats ([5d3fa4a](https://github.com/Mearman/schema-components/commit/5d3fa4a20b3c65af83059ab2b111fda9392085c1))
* add type-safe openapi components with generic inference ([683e950](https://github.com/Mearman/schema-components/commit/683e950cf08a52538bbfa873400386616ec98756))
* add typed errors, onError callback, and React error boundary ([893f9a1](https://github.com/Mearman/schema-components/commit/893f9a1fc251159c80a73b45fbc1d6f63f99a857))
* add unit tests and fix schema passthrough bug ([23092cc](https://github.com/Mearman/schema-components/commit/23092ccdac3cd37068b0eae08753ba654c50359a))
* flatten nested fields prop for walker field overrides ([a72ffbe](https://github.com/Mearman/schema-components/commit/a72ffbe776feb830830bf7bf68dd6fc9b0deb8d0))
* implement core library — walker, adapter, renderer, React components ([2c95a2e](https://github.com/Mearman/schema-components/commit/2c95a2e448b2646c4d6c4565ceb30e99500ce732))
* replace string templates with typed h() builder ([83525b1](https://github.com/Mearman/schema-components/commit/83525b115f77b39c949e566d4838332dae5f92ae))
* type-safe fields prop with generic SchemaComponent<T, Ref> ([3ea1495](https://github.com/Mearman/schema-components/commit/3ea14950e3d20eb80d8b16186803f3ab0ed28f84))
* type-safe path prop on generic SchemaField ([8d5fef7](https://github.com/Mearman/schema-components/commit/8d5fef7405d6c4b2f914e0481e501eaf633ddc5b))
* wire adapter, resolver, and SchemaField into SchemaComponent ([cbc2ce1](https://github.com/Mearman/schema-components/commit/cbc2ce158c080a1a84a940781b81d9d065e055b1))

### Bug Fixes

* propagate field key as path in HTML renderChild ([e3f471c](https://github.com/Mearman/schema-components/commit/e3f471c2ee308edf1e6406c1fc6f70bfac8c6b37))
* readOnly/writeOnly overrides propagate correctly to nested fields ([a809b62](https://github.com/Mearman/schema-components/commit/a809b62bbe08ae44d3fdaa9b277a3ded07c6009d))

### Refactoring

* centralise type guards, resolver lookup, and resolver merge ([be354ac](https://github.com/Mearman/schema-components/commit/be354ac35b6d73ec0bbc746fae58c35758991ce0))
* remove duplicate ComponentResolver types from types.ts ([39702c5](https://github.com/Mearman/schema-components/commit/39702c5ab622be825ad7f1ad222c07dca85c57a4))
* unify RenderProps and HtmlRenderProps via BaseFieldProps ([a408da9](https://github.com/Mearman/schema-components/commit/a408da9a2f4b4bacf81f0a85f6aad117fa69bb8a))
* use json schema as authoritative internal representation ([6a996c5](https://github.com/Mearman/schema-components/commit/6a996c53517d18f39cb341f10ed3fafdd7777547))

### Documentation

* add README for schema-components design document ([c1251e4](https://github.com/Mearman/schema-components/commit/c1251e4eea39e0154c3e8cc91e5482271bb4ce95))
* rewrite README to match actual API ([a8fc57f](https://github.com/Mearman/schema-components/commit/a8fc57fe5e650c9f4f886f0525c8c58e309a70aa))
* update readme for json schema walker architecture ([9649430](https://github.com/Mearman/schema-components/commit/9649430f76f2fbef6d0ea7a8d9fd81ff478f644f))
* update README with h() builder, streaming, accessibility, errors ([01d2a9f](https://github.com/Mearman/schema-components/commit/01d2a9f32dcdf3827ce117901cd1b6ff9c3e3d26))

### Tests

* add parser unit tests and integration tests ([338dba3](https://github.com/Mearman/schema-components/commit/338dba368007dd2d34172a8dacfdb76606a588c6))

### Chores

* add mit license and contributing guide ([7d51c29](https://github.com/Mearman/schema-components/commit/7d51c2957ab06fdd6c8bb4a384b3906e453ae786))
* **build:** remove barrel files, use direct module exports ([08d4f21](https://github.com/Mearman/schema-components/commit/08d4f2148e3e06c95fd1db3a9c5a733a419f3fdc))
* **build:** replace tsc with tsdown for library bundling ([38951b2](https://github.com/Mearman/schema-components/commit/38951b2ef0b770ec883f18fe9f3d4f4bf7181a5a))
* pin all GitHub Actions to latest versions, fix CI types ([29c5b6e](https://github.com/Mearman/schema-components/commit/29c5b6e156c9a3b59e656a26c4bf147a1e5b5321))
* rename to schema-components, adopt OIDC trusted publishing ([61e5c75](https://github.com/Mearman/schema-components/commit/61e5c753d5d103538213157f6fd4810572480d72))
* set up repo devops ([1042810](https://github.com/Mearman/schema-components/commit/1042810992bf4cb45e77efd680008c184f307210))
