workspace {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop" {
            web = container "Web"
        }
        customer -> web
        customer -> shop
    }
}
