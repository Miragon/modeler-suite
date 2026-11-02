workspace {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop" {
            web = container "Web"
        }
        customer -> web "Uses"
    }
    views {
        systemLandscape "Landscape" {
            include *
            exclude "customer->shop"
            autoLayout tb 300 160
        }
    }
}
