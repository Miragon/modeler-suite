workspace {
    model {
        shop = softwareSystem "Shop" {
            web = container "Web"
        }
        shop -> web "Contains"
    }
}
