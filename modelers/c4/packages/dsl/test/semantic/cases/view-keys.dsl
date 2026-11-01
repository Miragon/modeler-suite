workspace {
    model {
        a = softwareSystem "A" {
            c = container "C" {
                k = component "K"
            }
        }
        b = softwareSystem "B"
        a -> b "Uses"
        c -> b "Calls"
        k -> b "Queries"
    }
    views {
        systemLandscape {
            include *
        }
        systemLandscape "SystemLandscape-002" {
            include *
        }
        systemLandscape {
            include *
        }
        systemContext a {
            include *
            autoLayout
        }
        systemContext b "ContextOfB" "The context of B" {
            include *
            autoLayout tb
        }
        container a {
            include *
            autoLayout lr 200 100 30 false
        }
        component c {
            include *
            title "Components of C"
            description "Overrides"
            default
        }
        dynamic a {
            c -> b
        }
        dynamic * "Dyn" {
            a -> b
        }
    }
}
