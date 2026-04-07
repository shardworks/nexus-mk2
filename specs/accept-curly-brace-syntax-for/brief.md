# Accept curly brace syntax for rig template variables

The variable interpolation syntax for rig templates currently must match `$foo` or `$spider.foo`. We need to support curly braces, as is common in bash and other templating languages.

So..

- `$foo` and `${foo}` would be equivalent
- `$spider.foo` and `${spider.foo}` would be equivalent

The latter two throw an error currently.
