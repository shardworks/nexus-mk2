# Update rig template variable handling

Goals: not mix 'rig template variables' in with standard spider configs, such as `rigTemplates` itself
Current State: In rig templates, `$spider.<name>` evaluates the value of the 'name' property on the `spider` apparatus config. I'd like to replace the `spider.` prefix with `vars.`, and also only resolve from a `variables` key nested under spider.

Current Config:

```
# guild.json
...
  "spider": {
    "foo": "bar"
    ...
  }
...
```

In the above, engine givens can reference `foo` as `$spider.foo`

Desired Config:
        
```
# guild.json
...
  "spider": {
    "variables": {
       "foo": "bar"
    }
    ...
  }
...
```

This would be the desired equivalent config would be `$vars.foo`. The placeholder `$spider.foo` would be an error.

## Additional Changes

- With this change, the `$role` special value should also be removed. If a `role` variable is desired, it should be placed under the `variables` key and referenced via `$vars.foo` directly
