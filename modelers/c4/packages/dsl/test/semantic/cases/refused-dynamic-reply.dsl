workspace {
    model {
        shop = softwareSystem "Shop" {
            web = container "Web"
            api = container "API"
        }
        web -> api "Calls"
    }
    views {
        dynamic shop "Steps" {
            api -> web "Returns"
        }
    }
}
