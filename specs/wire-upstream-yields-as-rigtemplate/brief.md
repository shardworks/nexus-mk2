# Wire upstream yields as rigTemplate givens

The rigTemplate specification allows templating against config variables in the spider (`$vars.<id>` or `${vars.id}` syntax). We should extend this to allow values yielded by upstream engines to be supplied as givens. One possible syntax is to use a template expression such as `${yields.<engine_id>.<yield_name>}`.
