package com.hardyzheng.masonmd;

import org.springframework.stereotype.Component;

import run.halo.app.plugin.BasePlugin;
import run.halo.app.plugin.PluginContext;

/**
 * @author Hardy Zheng
 * @since 2.0.0
 */
@Component
public class MasonMarkdownPlugin extends BasePlugin {

    public MasonMarkdownPlugin(PluginContext context) {
        super(context);
    }
}
