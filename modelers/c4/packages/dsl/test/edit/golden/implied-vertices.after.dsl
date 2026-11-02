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
            properties {
                "c4modeler.element.customer" "0,0"
                "c4modeler.element.shop" "400,0"
                "c4modeler.relationship.implied:customer->shop" "200,-80"
            }
        }
    }
}
